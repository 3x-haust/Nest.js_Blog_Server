import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/\n{3,}/g, '\n\n') : value,
  )
  content: string;
}
