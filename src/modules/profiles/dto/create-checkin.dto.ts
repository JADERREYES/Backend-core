import { IsOptional, IsString } from 'class-validator';

export class CreateCheckInDto {
  @IsString()
  mood: string;

  @IsOptional()
  @IsString()
  energy?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
