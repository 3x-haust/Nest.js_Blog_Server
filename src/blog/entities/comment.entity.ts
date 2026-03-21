import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PostEntity } from './post.entity';

@Entity('comments')
export class CommentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  postId: string;

  @ManyToOne(() => PostEntity, (post) => post.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'postId' })
  post: PostEntity;

  @Column()
  nickname: string;

  @Column({ type: 'text', nullable: true })
  avatarSeed: string | null;

  @Column('text')
  content: string;

  @Column({ type: 'text', nullable: true })
  parentId: string | null;

  @Column({ default: false })
  isAdminReply: boolean;

  @Column({ default: false })
  edited: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
