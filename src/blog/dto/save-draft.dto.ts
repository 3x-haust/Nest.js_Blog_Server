import { IsArray, IsOptional, IsString } from 'class-validator';

export class SaveDraftDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  thumbnail?: string;

  @IsArray()
  @IsOptional()
  tags?: string[];

  @IsArray()
  @IsOptional()
  content?: unknown[];

  @IsOptional()
  isPublic?: boolean;
}
