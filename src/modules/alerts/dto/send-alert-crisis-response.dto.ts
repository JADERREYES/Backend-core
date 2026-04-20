import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SendAlertCrisisResponseDto {
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  message?: string;
}
