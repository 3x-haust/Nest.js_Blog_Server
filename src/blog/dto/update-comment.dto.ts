import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/\n{3,}/g, '\n\n') : value,
  )
  content: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  @Matches(/^\S+$/, { message: '닉네임에 공백을 포함할 수 없습니다.' })
  nickname?: string;
}
