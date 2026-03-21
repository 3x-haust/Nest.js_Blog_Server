import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreatePostDto {
  @IsString()
  slug: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  thumbnail?: string;

  @IsArray()
  tags: string[];

  @IsArray()
  content: unknown[];

  @IsOptional()
  @IsInt()
  @Min(0)
  views?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  readingTime?: number;
}
