import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreatePremiumRequestDto {
  @IsIn(['premium', 'extra_tokens', 'custom'])
  requestType: 'premium' | 'extra_tokens' | 'custom';

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
