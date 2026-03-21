import { IsString, MinLength } from 'class-validator';

export class CreateHeartDto {
  @IsString()
  @MinLength(8)
  clientId: string;
}
