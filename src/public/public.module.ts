import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { BlogModule } from '../blog/blog.module';

@Module({
  imports: [BlogModule],
  controllers: [PublicController],
})
export class PublicModule {}
