import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { Cron } from '@nestjs/schedule';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Repository } from 'typeorm';
import { PostEntity } from './entities/post.entity';
import { CommentEntity } from './entities/comment.entity';
import { HeartEntity } from './entities/heart.entity';
import { ImageEntity } from './entities/image.entity';
import { DraftEntity } from './entities/draft.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class BlogService {
  private readonly indexName = 'blog_posts';
  private readonly seriesTagPrefix = 'series:';
  private readonly logger = new Logger(BlogService.name);
  private readonly uploadPrefix = '/uploads/images/';

  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(CommentEntity)
    private readonly commentRepository: Repository<CommentEntity>,
    @InjectRepository(HeartEntity)
    private readonly heartRepository: Repository<HeartEntity>,
    @InjectRepository(ImageEntity)
    private readonly imageRepository: Repository<ImageEntity>,
    @InjectRepository(DraftEntity)
    private readonly draftRepository: Repository<DraftEntity>,
    private readonly elasticsearchService: ElasticsearchService,
  ) {}

  async findDrafts(): Promise<DraftEntity[]> {
    return this.draftRepository.find({
      order: { updatedAt: 'DESC' },
    });
  }

  async findDraftById(id: string): Promise<DraftEntity> {
    const draft = await this.draftRepository.findOne({ where: { id } });
    if (!draft) {
      throw new NotFoundException('Draft not found');
    }
    return draft;
  }

  async saveDraft(payload: {
    id?: string;
    title?: string;
    thumbnail?: string;
    tags?: string[];
    content?: unknown[];
    isPublic?: boolean;
  }): Promise<DraftEntity> {
    const draft = payload.id
      ? await this.draftRepository.findOne({ where: { id: payload.id } })
      : null;

    if (draft) {
      Object.assign(draft, { ...payload });
      return this.draftRepository.save(draft);
    }

    const newDraft = this.draftRepository.create({
      id: payload.id ?? undefined,
      title: payload.title ?? '',
      thumbnail: payload.thumbnail ?? null,
      tags: payload.tags ?? [],
      content: payload.content ?? [],
      isPublic: payload.isPublic ?? true,
    });

    return this.draftRepository.save(newDraft);
  }

  async deleteDraft(id: string): Promise<void> {
    const draft = await this.findDraftById(id);
    await this.draftRepository.delete({ id: draft.id });
  }

  async trackUploadedImage(url: string, mimeType: string): Promise<void> {
    if (!this.isManagedImageUrl(url)) {
      return;
    }

    const filename = this.extractFilename(url);
    if (!filename) {
      return;
    }

    const existing = await this.imageRepository.findOne({ where: { url } });
    if (existing) {
      return;
    }

    const image = this.imageRepository.create({ url, filename, mimeType });
    await this.imageRepository.save(image);
  }

  @Cron('0 30 3 * * *')
  async cleanupUnusedImages(): Promise<void> {
    const graceHours = Number(process.env.IMAGE_CLEANUP_GRACE_HOURS ?? 24);
    const safeGraceHours = Number.isFinite(graceHours)
      ? Math.max(1, graceHours)
      : 24;
    const threshold = new Date(Date.now() - safeGraceHours * 60 * 60 * 1000);

    const referencedUrls = await this.collectReferencedImageUrls();
    const images = await this.imageRepository.find();
    const targets = images.filter(
      (image) =>
        !referencedUrls.has(image.url) &&
        image.createdAt.getTime() < threshold.getTime(),
    );

    if (!targets.length) {
      return;
    }

    let deletedCount = 0;
    for (const image of targets) {
      const removed = await this.removeImageFile(image.url);
      if (!removed) {
        continue;
      }

      await this.imageRepository.delete({ id: image.id });
      deletedCount += 1;
    }

    if (deletedCount > 0) {
      this.logger.log(`Cleaned ${deletedCount} unused image(s)`);
    }
  }

  async findPosts(
    query?: string,
    tag?: string,
    isAdmin = false,
  ): Promise<PostEntity[]> {
    if (query?.trim()) {
      const elasticResult = await this.searchByElastic(
        query.trim(),
        tag,
        isAdmin,
      );
      if (elasticResult) {
        return elasticResult;
      }
    }

    const where: any = {};
    if (!isAdmin) {
      where.isPublic = true;
    }

    const allPosts = await this.postRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });

    return allPosts.filter((post) => {
      const byTag = tag?.trim() ? post.tags.includes(tag.trim()) : true;
      const byQuery = query?.trim()
        ? [post.title, ...post.tags, this.getPlainText(post.content)]
            .join(' ')
            .toLowerCase()
            .includes(query.trim().toLowerCase())
        : true;
      return byTag && byQuery;
    });
  }

  async findTagSummary() {
    const posts = await this.postRepository.find({
      where: { isPublic: true },
      select: ['tags'],
    });
    const counts = new Map<string, number>();

    posts.forEach((post) => {
      post.tags.forEach((tag) => {
        if (this.isSeriesTag(tag)) {
          return;
        }
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      });
    });

    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  async findPostBySlug(slug: string, isAdmin = false): Promise<PostEntity> {
    const post = await this.postRepository.findOne({ where: { slug } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    if (!isAdmin && !post.isPublic) {
      throw new NotFoundException('Post not found');
    }
    return post;
  }

  async toggleVisibility(slug: string, isPublic: boolean): Promise<PostEntity> {
    const post = await this.postRepository.findOne({ where: { slug } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    post.isPublic = isPublic;
    return this.postRepository.save(post);
  }

  async findRelatedPosts(slug: string, limit = 3, isAdmin = false) {
    const current = await this.findPostBySlug(slug, isAdmin);
    const all = await this.postRepository.find();

    return all
      .filter((post) => post.slug !== current.slug)
      .map((post) => ({
        post,
        score: post.tags.filter((tag) => current.tags.includes(tag)).length,
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.post);
  }

  async findSeriesPosts(slug: string, isAdmin = false) {
    const current = await this.findPostBySlug(slug, isAdmin);
    const seriesTag = current.tags.find((tag) => this.isSeriesTag(tag));

    if (!seriesTag) {
      return { series: null, posts: [] };
    }

    const series = seriesTag.slice(this.seriesTagPrefix.length).trim();
    const allPosts = await this.postRepository.find({
      order: { createdAt: 'ASC' },
    });
    const posts = allPosts.filter((post) => post.tags.includes(seriesTag));

    return { series, posts };
  }

  async createPost(
    payload: CreatePostDto,
    authorId: string,
  ): Promise<PostEntity> {
    const exists = await this.postRepository.findOne({
      where: { slug: payload.slug },
    });
    if (exists) {
      throw new BadRequestException('Slug already exists');
    }

    const post = this.postRepository.create({
      slug: payload.slug,
      title: payload.title,
      thumbnail: payload.thumbnail ?? null,
      tags: payload.tags,
      content: payload.content,
      views: payload.views ?? 0,
      readingTime: payload.readingTime ?? 1,
      authorId,
    });

    const saved = await this.postRepository.save(post);
    await this.ensureReferencedImagesTracked(saved);
    void this.indexPost(saved);
    return saved;
  }

  async updatePost(
    slug: string,
    payload: UpdatePostDto,
    authorId: string,
  ): Promise<PostEntity> {
    const post = await this.findPostBySlug(slug);

    if (post.authorId && post.authorId !== authorId) {
      throw new ForbiddenException('You can only edit your own posts');
    }

    Object.assign(post, {
      ...payload,
      thumbnail:
        payload.thumbnail === undefined
          ? post.thumbnail
          : ((payload.thumbnail as string | null) ?? null),
      authorId: post.authorId || authorId,
    });

    const updated = await this.postRepository.save(post);
    await this.ensureReferencedImagesTracked(updated);
    void this.indexPost(updated);
    return updated;
  }

  async deletePost(slug: string, authorId: string): Promise<void> {
    const post = await this.findPostBySlug(slug);

    if (post.authorId && post.authorId !== authorId) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    await this.postRepository.delete({ id: post.id });

    try {
      await this.elasticsearchService.delete({
        index: this.indexName,
        id: post.id,
      });
    } catch {
      return;
    }
  }

  async incrementView(slug: string): Promise<void> {
    const post = await this.findPostBySlug(slug);
    post.views += 1;
    await this.postRepository.save(post);
  }

  async addHeart(
    slug: string,
    clientId: string,
  ): Promise<{ heartCount: number; liked: boolean }> {
    const post = await this.findPostBySlug(slug);

    const existing = await this.heartRepository.findOne({
      where: { postId: post.id, clientId },
    });

    if (existing) {
      await this.heartRepository.delete({ id: existing.id });
      post.heartCount = Math.max(0, post.heartCount - 1);
      await this.postRepository.save(post);
      return { heartCount: post.heartCount, liked: false };
    }

    const heart = this.heartRepository.create({ postId: post.id, clientId });
    await this.heartRepository.save(heart);

    post.heartCount += 1;
    await this.postRepository.save(post);

    return { heartCount: post.heartCount, liked: true };
  }

  async hasHeart(
    slug: string,
    clientId: string,
  ): Promise<{ liked: boolean; heartCount: number }> {
    const post = await this.findPostBySlug(slug);
    const existing = await this.heartRepository.findOne({
      where: { postId: post.id, clientId },
    });

    return { liked: Boolean(existing), heartCount: post.heartCount };
  }

  async findComments(slug: string) {
    const post = await this.findPostBySlug(slug);
    const comments = await this.commentRepository.find({
      where: { postId: post.id },
      order: { createdAt: 'ASC' },
    });

    const roots = comments.filter((comment) => !comment.parentId);

    return roots.map((comment) => ({
      ...comment,
      replies: comments.filter((reply) => reply.parentId === comment.id),
    }));
  }

  async createComment(slug: string, payload: CreateCommentDto) {
    const post = await this.findPostBySlug(slug);

    const existingComment = await this.commentRepository.findOne({
      where: { postId: post.id, nickname: payload.nickname },
    });

    if (existingComment) {
      throw new BadRequestException('이미 사용 중인 닉네임입니다.');
    }

    const comment = this.commentRepository.create({
      postId: post.id,
      nickname: payload.nickname,
      avatarSeed: payload.avatarSeed ?? payload.nickname,
      content: payload.content,
      parentId: null,
      isAdminReply: false,
      edited: false,
    });

    return this.commentRepository.save(comment);
  }

  async createAdminReply(
    slug: string,
    commentId: string,
    content: string,
    adminNickname?: string,
  ) {
    const post = await this.findPostBySlug(slug);

    const parent = await this.commentRepository.findOne({
      where: { id: commentId, postId: post.id },
    });

    if (!parent) {
      throw new NotFoundException('Comment not found');
    }

    const resolvedAdminNickname = adminNickname?.trim() || 'admin';

    const reply = this.commentRepository.create({
      postId: post.id,
      nickname: resolvedAdminNickname,
      avatarSeed: resolvedAdminNickname,
      content,
      parentId: parent.id,
      isAdminReply: true,
      edited: false,
    });

    return this.commentRepository.save(reply);
  }

  async updateComment(
    slug: string,
    commentId: string,
    content: string,
    nickname?: string,
  ): Promise<CommentEntity> {
    const post = await this.findPostBySlug(slug);
    const comment = await this.commentRepository.findOne({
      where: { id: commentId, postId: post.id },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.isAdminReply) {
      if (nickname) {
        comment.nickname = nickname;
      }
      comment.content = content;
    } else {
      if (nickname) {
        comment.nickname = nickname;
      } else {
        throw new ForbiddenException('User comments content cannot be edited');
      }
    }

    comment.edited = true;
    return this.commentRepository.save(comment);
  }

  async deleteComment(slug: string, commentId: string): Promise<void> {
    const post = await this.findPostBySlug(slug);
    const comment = await this.commentRepository.findOne({
      where: { id: commentId, postId: post.id },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    await this.commentRepository.delete([
      { id: comment.id, postId: post.id },
      { parentId: comment.id, postId: post.id },
    ]);
  }

  private async indexPost(post: PostEntity): Promise<void> {
    try {
      await this.elasticsearchService.index({
        index: this.indexName,
        id: post.id,
        document: {
          slug: post.slug,
          title: post.title,
          tags: post.tags,
          plainText: this.getPlainText(post.content),
          isPublic: post.isPublic,
          createdAt: post.createdAt,
        },
      });
    } catch {
      return;
    }
  }

  private async searchByElastic(
    query: string,
    tag?: string,
    isAdmin = false,
  ): Promise<PostEntity[] | null> {
    try {
      const result = await this.elasticsearchService.search<{ slug: string }>({
        index: this.indexName,
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query,
                  fields: ['title^3', 'tags^2', 'plainText'],
                },
              },
            ],
            filter: [
              ...(tag?.trim() ? [{ term: { tags: tag.trim() } }] : []),
              ...(!isAdmin ? [{ term: { isPublic: true } }] : []),
            ],
          },
        },
      });

      const slugs = result.hits.hits
        .map((hit) => hit._source?.slug)
        .filter((value): value is string => Boolean(value));

      if (!slugs.length) {
        return [];
      }

      const posts = await this.postRepository.find({
        where: slugs.map((slug) => ({ slug })),
      });
      return slugs
        .map((slug) => posts.find((post) => post.slug === slug))
        .filter((post): post is PostEntity => Boolean(post));
    } catch {
      return null;
    }
  }

  private getPlainText(content: unknown[]): string {
    if (!Array.isArray(content)) {
      return '';
    }

    return content
      .map((block) => {
        if (typeof block === 'object' && block !== null && 'content' in block) {
          const value = (block as { content?: unknown }).content;
          return typeof value === 'string' ? value : '';
        }
        return '';
      })
      .join(' ')
      .trim();
  }

  private isSeriesTag(tag: string): boolean {
    return tag.toLowerCase().startsWith(this.seriesTagPrefix);
  }

  private async collectReferencedImageUrls(): Promise<Set<string>> {
    const urls = new Set<string>();

    const posts = await this.postRepository.find({
      select: ['thumbnail', 'content'],
    });

    posts.forEach((post) => {
      const extracted = this.extractImageUrlsFromPost(
        post.thumbnail,
        post.content,
      );
      extracted.forEach((url) => urls.add(url));
    });

    const drafts = await this.draftRepository.find({
      select: ['content'],
    });

    drafts.forEach((draft) => {
      this.walkForImageUrls(draft.content, urls);
    });

    return urls;
  }

  private extractImageUrlsFromPost(
    thumbnail: string | null,
    content: unknown,
  ): Set<string> {
    const urls = new Set<string>();

    if (thumbnail && this.isManagedImageUrl(thumbnail)) {
      urls.add(thumbnail);
    }

    this.walkForImageUrls(content, urls);

    return urls;
  }

  private walkForImageUrls(value: unknown, urls: Set<string>): void {
    if (typeof value === 'string') {
      if (this.isManagedImageUrl(value)) {
        urls.add(value);
      }
      this.extractMarkdownImageUrls(value).forEach((url) => urls.add(url));
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => this.walkForImageUrls(item, urls));
      return;
    }

    if (value && typeof value === 'object') {
      Object.values(value).forEach((item) => this.walkForImageUrls(item, urls));
    }
  }

  private extractMarkdownImageUrls(text: string): string[] {
    const matches = text.matchAll(
      /!\[[^\]]*\]\((\/uploads\/images\/[^)\s]+)\)/g,
    );
    return [...matches].map((match) => match[1]);
  }

  private isManagedImageUrl(url: string): boolean {
    return url.startsWith(this.uploadPrefix);
  }

  private extractFilename(url: string): string | null {
    if (!this.isManagedImageUrl(url)) {
      return null;
    }
    return url.slice(this.uploadPrefix.length).trim() || null;
  }

  private async ensureReferencedImagesTracked(post: PostEntity): Promise<void> {
    const referencedUrls = this.extractImageUrlsFromPost(
      post.thumbnail,
      post.content,
    );
    if (!referencedUrls.size) {
      return;
    }

    for (const url of referencedUrls) {
      const filename = this.extractFilename(url);
      if (!filename) {
        continue;
      }

      const existing = await this.imageRepository.findOne({ where: { url } });
      if (existing) {
        continue;
      }

      const image = this.imageRepository.create({
        url,
        filename,
        mimeType: 'image/webp',
      });
      await this.imageRepository.save(image);
    }
  }

  private async removeImageFile(url: string): Promise<boolean> {
    const filename = this.extractFilename(url);
    if (!filename) {
      return false;
    }

    const filePath = join(process.cwd(), 'uploads', 'images', filename);

    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      try {
        await fs.access(filePath);
        return false;
      } catch {
        return true;
      }
    }
  }
}
