import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CommentEntity } from './comment.entity';
import { HeartEntity } from './heart.entity';

@Entity('posts')
export class PostEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  thumbnail: string | null;

  @Column('text', { array: true, default: [] })
  tags: string[];

  @Column({ type: 'jsonb', default: [] })
  content: unknown[];

  @Column({ default: 0 })
  views: number;

  @Column({ default: 0 })
  heartCount: number;

  @Column({ default: 1 })
  readingTime: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => CommentEntity, (comment) => comment.post)
  comments: CommentEntity[];

  @OneToMany(() => HeartEntity, (heart) => heart.post)
  hearts: HeartEntity[];
}
