import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogModule } from './blog/blog.module';
import { PostEntity } from './blog/entities/post.entity';
import { CommentEntity } from './blog/entities/comment.entity';
import { HeartEntity } from './blog/entities/heart.entity';
import { ImageEntity } from './blog/entities/image.entity';
import { AdminUserEntity } from './auth/entities/admin-user.entity';
import { DraftEntity } from './blog/entities/draft.entity';

import { MetadataModule } from './metadata/metadata.module';
import { PublicModule } from './public/public.module';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_NAME ?? 'blog',
      entities: [
        PostEntity,
        CommentEntity,
        HeartEntity,
        ImageEntity,
        AdminUserEntity,
        DraftEntity,
      ],
      synchronize: true,
      logging: false,
    }),
    BlogModule,
    MetadataModule,
    PublicModule,
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
      {
        name: 'view',
        ttl: 1800000,
        limit: 1,
      },
      {
        name: 'comment',
        ttl: 60000,
        limit: 3,
      },
    ]),
  ],
})
export class AppModule { }
