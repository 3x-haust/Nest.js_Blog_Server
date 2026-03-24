import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import { PostEntity } from './entities/post.entity';
import { CommentEntity } from './entities/comment.entity';
import { HeartEntity } from './entities/heart.entity';
import { ImageEntity } from './entities/image.entity';
import { DraftEntity } from './entities/draft.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PostEntity,
      CommentEntity,
      HeartEntity,
      ImageEntity,
      DraftEntity,
    ]),
    ElasticsearchModule.register({
      node: process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200',
      requestTimeout: Number(
        process.env.ELASTICSEARCH_REQUEST_TIMEOUT_MS ?? 800,
      ),
      maxRetries: Number(process.env.ELASTICSEARCH_MAX_RETRIES ?? 1),
    }),
    AuthModule,
  ],
  controllers: [BlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
