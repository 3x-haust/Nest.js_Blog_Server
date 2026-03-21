import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(2)
  nickname: string;

  @IsString()
  @MinLength(4)
  password: string;
}
