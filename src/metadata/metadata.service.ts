import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';

@Injectable()
export class MetadataService {
  private readonly logger = new Logger(MetadataService.name);

  async getMetadata(url: string) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        timeout: 5000,
      });

      const $ = cheerio.load(response.data);

      const title =
        $('meta[property="og:title"]').attr('content') ||
        $('meta[name="twitter:title"]').attr('content') ||
        $('title').text() ||
        url;

      const description =
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="twitter:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        '';

      const image =
        $('meta[property="og:image"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content') ||
        $('link[rel="image_src"]').attr('href') ||
        '';

      const siteName =
        $('meta[property="og:site_name"]').attr('content') ||
        new URL(url).hostname;

      return {
        title: title.trim(),
        description: description.trim(),
        image: image,
        siteName: siteName.trim(),
        url,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch metadata for ${url}: ${error.message}`,
      );
      return {
        title: url,
        description: '',
        image: '',
        siteName: new URL(url).hostname,
        url,
      };
    }
  }
}
