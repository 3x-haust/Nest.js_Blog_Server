import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PostEntity } from './post.entity';

@Entity('hearts')
@Index(['postId', 'clientId'], { unique: true })
export class HeartEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  postId: string;

  @ManyToOne(() => PostEntity, (post) => post.hearts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'postId' })
  post: PostEntity;

  @Column()
  clientId: string;

  @CreateDateColumn()
  createdAt: Date;
}
