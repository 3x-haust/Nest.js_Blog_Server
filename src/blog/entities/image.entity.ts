import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('images')
export class ImageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  url: string;

  @Column({ unique: true })
  filename: string;

  @Column()
  mimeType: string;

  @CreateDateColumn()
  createdAt: Date;
}
