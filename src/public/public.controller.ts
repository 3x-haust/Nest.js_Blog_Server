import { Controller, Get, Param, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { BlogService } from '../blog/blog.service';
import { join } from 'path';
import { promises as fs } from 'fs';

@Controller()
export class PublicController {
  private readonly logger = new Logger(PublicController.name);
  private readonly clientIndexPath = join(
    process.cwd(),
    '..',
    'blog_client',
    'index.html',
  );

  constructor(private readonly blogService: BlogService) { }

  @Get('posts/:slug')
  async getPostWithMeta(@Param('slug') slug: string, @Res() res: Response) {
    try {
      const post = await this.blogService.findPostBySlug(slug);
      let html = await fs.readFile(this.clientIndexPath, 'utf8');

      const getPlainText = (content: any[]) => {
        if (!Array.isArray(content)) return '';
        return content
          .map((block) =>
            typeof block?.content === 'string' ? block.content : '',
          )
          .join(' ')
          .slice(0, 160);
      };

      const title = `${post.title} - 3xhaust blog`;
      const description = getPlainText(post.content as any[]);
      const image = post.thumbnail || 'https://3xhaust.dev/og-image.png';
      const url = `https://3xhaust.dev/posts/${slug}`;

      html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);

      html = this.replaceMetaTag(html, 'og:title', title);
      html = this.replaceMetaTag(html, 'og:description', description);
      html = this.replaceMetaTag(html, 'og:image', image);
      html = this.replaceMetaTag(html, 'og:url', url);

      html = this.replaceMetaTag(html, 'twitter:title', title, 'name');
      html = this.replaceMetaTag(
        html,
        'twitter:description',
        description,
        'name',
      );
      html = this.replaceMetaTag(html, 'twitter:image', image, 'name');

      html = html.replace(
        /<meta name="description" content=".*?" \/>/,
        `<meta name="description" content="${description}" />`,
      );

      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    } catch (error) {
      this.logger.error(
        `Error injecting meta tags for slug ${slug}: ${error.message}`,
      );
      return res.sendFile(this.clientIndexPath);
    }
  }

  @Get('sitemap.xml')
  async getSitemap(@Res() res: Response) {
    const { posts, tags } = await this.blogService.getSitemapData();
    const baseUrl = 'https://3xhaust.dev';

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${posts
        .map(
          (post) => `  <url>
    <loc>${baseUrl}/posts/${post.slug}</loc>
    <lastmod>${new Date(post.updatedAt).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
        )
        .join('\n')}
${tags
        .map(
          (tag) => `  <url>
    <loc>${baseUrl}/tags/${encodeURIComponent(tag)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>`,
        )
        .join('\n')}
</urlset>`;

    res.header('Content-Type', 'application/xml');
    return res.send(xml);
  }

  private replaceMetaTag(
    html: string,
    property: string,
    content: string,
    attr = 'property',
  ): string {
    const regex = new RegExp(
      `<meta ${attr}="${property}" content=".*?" \/>`,
      'g',
    );
    const newTag = `<meta ${attr}="${property}" content="${content}" />`;

    if (regex.test(html)) {
      return html.replace(regex, newTag);
    }
    return html.replace('</head>', `  ${newTag}\n  </head>`);
  }
}
