import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class SubscriptionLimitsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  maxChatsPerMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxMessagesPerMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxDocumentsMB?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  extraTokens?: number;
}

export class CreateSubscriptionDto {
  @IsOptional()
  @IsString()
  planId?: string;

  @IsString()
  @MaxLength(120)
  planName: string;

  @IsString()
  @MaxLength(60)
  planCode: string;

  @IsIn(['free', 'trial', 'premium', 'extra_tokens', 'custom'])
  planCategory: 'free' | 'trial' | 'premium' | 'extra_tokens' | 'custom';

  @IsOptional()
  @IsIn(['active', 'expired', 'canceled', 'pending_activation'])
  status?: 'active' | 'expired' | 'canceled' | 'pending_activation';

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SubscriptionLimitsDto)
  limits?: SubscriptionLimitsDto;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  sourceRequestId?: string;
}
