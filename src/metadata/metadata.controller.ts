import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { SuccessMessage } from '@3xhaust/nest-response';
import { MetadataService } from './metadata.service';

@Controller('metadata')
export class MetadataController {
  constructor(private readonly metadataService: MetadataService) {}

  @Get()
  @SuccessMessage('Metadata fetched')
  async getMetadata(@Query('url') url: string) {
    if (!url) {
      throw new BadRequestException('URL is required');
    }

    try {
      new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    return this.metadataService.getMetadata(url);
  }
}
