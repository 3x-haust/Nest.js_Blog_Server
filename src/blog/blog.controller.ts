import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SuccessMessage } from '@3xhaust/nest-response';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { Request } from 'express';
import { promises as fs } from 'fs';
import { join } from 'path';
import * as sharp from 'sharp';
import { BlogService } from './blog.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateHeartDto } from './dto/create-heart.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { OptionalAdminAuthGuard } from '../auth/optional-admin-auth.guard';
import { ViewThrottlerGuard } from './guards/view-throttler.guard';

type UploadFile = {
  mimetype: string;
  buffer: Buffer;
};

type AdminRequest = Request & {
  admin?: {
    sub: string;
    nickname: string;
  };
};

const isUploadFile = (value: unknown): value is UploadFile => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<UploadFile>;
  return (
    typeof candidate.mimetype === 'string' && Buffer.isBuffer(candidate.buffer)
  );
};

@Controller()
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class BlogController {
  constructor(private readonly blogService: BlogService) { }

  @Get('drafts')
  @UseGuards(AdminAuthGuard)
  @SuccessMessage('Drafts fetched')
  findDrafts() {
    return this.blogService.findDrafts();
  }

  @Get('drafts/:id')
  @UseGuards(AdminAuthGuard)
  @SuccessMessage('Draft fetched')
  findDraft(@Param('id') id: string) {
    return this.blogService.findDraftById(id);
  }

  @Post('drafts')
  @UseGuards(AdminAuthGuard)
  @SuccessMessage('Draft saved')
  saveDraft(@Body() body: SaveDraftDto) {
    return this.blogService.saveDraft(body);
  }

  @Delete('drafts/:id')
  @UseGuards(AdminAuthGuard)
  @SuccessMessage('Draft deleted')
  async deleteDraft(@Param('id') id: string) {
    await this.blogService.deleteDraft(id);
    return true;
  }

  @Get('posts')
  @UseGuards(OptionalAdminAuthGuard)
  @SuccessMessage('Posts fetched')
  findPosts(
    @Query('q') query?: string,
    @Query('tag') tag?: string,
    @Req() req?: AdminRequest,
  ) {
    const isAdmin = Boolean(req?.admin);
    return this.blogService.findPosts(query, tag, isAdmin);
  }

  @Get('posts')
  @UseGuards(AdminAuthGuard)
  @SuccessMessage('All posts fetched (admin)')
  findPostsAdmin(@Query('q') query?: string, @Query('tag') tag?: string) {
    return this.blogService.findPosts(query, tag, true);
  }

  @Get('posts/:slug')
  @UseGuards(OptionalAdminAuthGuard)
  @SuccessMessage('Post fetched')
  findPost(@Param('slug') slug: string, @Req() req?: AdminRequest) {
    const isAdmin = Boolean(req?.admin);
    return this.blogService.findPostBySlug(slug, isAdmin);
  }

  @Get('posts/:slug/related')
  @SuccessMessage('Related posts fetched')
  findRelated(@Param('slug') slug: string, @Query('limit') limit?: string) {
    const parsedLimit = Number(limit ?? 3);
    return this.blogService.findRelatedPosts(
      slug,
      Number.isNaN(parsedLimit) ? 3 : parsedLimit,
    );
  }

  @Get('posts/:slug/series')
  @SuccessMessage('Series posts fetched')
  findSeries(@Param('slug') slug: string) {
    return this.blogService.findSeriesPosts(slug);
  }

  @Post('posts')
  @UseGuards(AdminAuthGuard)
  @SuccessMessage('Post created')
  createPost(@Body() body: CreatePostDto, @Req() req: AdminRequest) {
    return this.blogService.createPost(body, req.admin!.sub);
  }

  @Patch('posts/:slug')
  @UseGuards(AdminAuthGuard)
  @SuccessMessage('Post updated')
  updatePost(
    @Param('slug') slug: string,
    @Body() body: UpdatePostDto,
    @Req() req: AdminRequest,
  ) {
    return this.blogService.updatePost(slug, body, req.admin!.sub);
  }

  @Patch('posts/:slug/visibility')
  @UseGuards(AdminAuthGuard)
  @SuccessMessage('Post visibility updated')
  toggleVisibility(
    @Param('slug') slug: string,
    @Body('isPublic') isPublic: boolean,
  ) {
    return this.blogService.toggleVisibility(slug, isPublic);
  }

  @Delete('posts/:slug')
  @UseGuards(AdminAuthGuard)
  @SuccessMessage('Post deleted')
  async deletePost(@Param('slug') slug: string, @Req() req: AdminRequest) {
    await this.blogService.deletePost(slug, req.admin!.sub);
    return true;
  }

  @Post('posts/:slug/view')
  @UseGuards(ViewThrottlerGuard)
  @Throttle({ view: { limit: 1, ttl: 1800000 } })
  @SuccessMessage('View incremented')
  async incrementView(@Param('slug') slug: string) {
    await this.blogService.incrementView(slug);
    return true;
  }

  @Get('posts/:slug/heart')
  @SuccessMessage('Heart status fetched')
  getHeartStatus(
    @Param('slug') slug: string,
    @Query('clientId') clientId: string,
  ) {
    return this.blogService.hasHeart(slug, clientId);
  }

  @Post('posts/:slug/heart')
  @SuccessMessage('Heart saved')
  createHeart(@Param('slug') slug: string, @Body() body: CreateHeartDto) {
    return this.blogService.addHeart(slug, body.clientId);
  }

  @Get('posts/:slug/comments')
  @SuccessMessage('Comments fetched')
  findComments(@Param('slug') slug: string) {
    return this.blogService.findComments(slug);
  }

  @Post('posts/:slug/comments')
  @SuccessMessage('Comment created')
  createComment(@Param('slug') slug: string, @Body() body: CreateCommentDto) {
    return this.blogService.createComment(slug, body);
  }

  @Post('posts/:slug/comments/:commentId/reply')
  @UseGuards(AdminAuthGuard)
  @SuccessMessage('Reply created')
  createReply(
    @Param('slug') slug: string,
    @Param('commentId') commentId: string,
    @Body('content') content: string,
    @Req() request: AdminRequest,
  ) {
    return this.blogService.createAdminReply(
      slug,
      commentId,
      content,
      request.admin?.nickname,
    );
  }

  @Patch('posts/:slug/comments/:commentId')
  @UseGuards(AdminAuthGuard)
  @SuccessMessage('Comment updated')
  updateComment(
    @Param('slug') slug: string,
    @Param('commentId') commentId: string,
    @Body() body: UpdateCommentDto,
  ) {
    return this.blogService.updateComment(
      slug,
      commentId,
      body.content,
      body.nickname,
    );
  }

  @Delete('posts/:slug/comments/:commentId')
  @UseGuards(AdminAuthGuard)
  @SuccessMessage('Comment deleted')
  async deleteComment(
    @Param('slug') slug: string,
    @Param('commentId') commentId: string,
  ) {
    await this.blogService.deleteComment(slug, commentId);
    return true;
  }

  @Get('tags')
  @SuccessMessage('Tags fetched')
  findTags() {
    return this.blogService.findTagSummary();
  }

  @Post('uploads/image')
  @UseGuards(AdminAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @SuccessMessage('Image uploaded')
  async uploadImage(@UploadedFile() file?: unknown) {
    if (!isUploadFile(file)) {
      throw new BadRequestException('파일이 필요합니다.');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('이미지 파일만 업로드할 수 있습니다.');
    }

    const uploadsDir = join(process.cwd(), 'uploads', 'images');
    await fs.mkdir(uploadsDir, { recursive: true });

    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `${datePrefix}_${randomUUID()}.webp`;
    const outputPath = join(uploadsDir, filename);

    try {
      await sharp(file.buffer)
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 78 })
        .toFile(outputPath);
    } catch {
      throw new BadRequestException(
        '이미지 변환에 실패했습니다. 다른 이미지 파일로 다시 시도해주세요.',
      );
    }

    const url = `/uploads/images/${filename}`;
    await this.blogService.trackUploadedImage(url, file.mimetype);
    return { url };
  }
}
