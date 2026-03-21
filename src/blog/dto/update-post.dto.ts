import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdatePostDto {
  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  thumbnail?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsArray()
  content?: unknown[];

  @IsOptional()
  @IsInt()
  @Min(0)
  views?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  readingTime?: number;
}
