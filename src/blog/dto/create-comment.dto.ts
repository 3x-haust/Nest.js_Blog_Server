import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  nickname: string;

  @IsOptional()
  @IsString()
  avatarSeed?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content: string;
}
