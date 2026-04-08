import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ActivateSubscriptionRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNotes?: string;
}
