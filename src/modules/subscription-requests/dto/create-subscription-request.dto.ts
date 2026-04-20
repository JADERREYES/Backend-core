import {
  IsNumberString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSubscriptionRequestDto {
  @IsString()
  planId: string;

  @IsString()
  paymentMethodId: string;

  @IsIn(['premium', 'extra_tokens', 'custom'])
  requestType: 'premium' | 'extra_tokens' | 'custom';

  @IsOptional()
  @IsString()
  requestedPlanCode?: string;

  @IsOptional()
  requestedTokens?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  payerName?: string;

  @IsString()
  @MaxLength(40)
  payerPhone: string;

  @IsOptional()
  @IsNumberString()
  reportedAmount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  paidAtReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
