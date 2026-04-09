import {
  IsBoolean,
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

class PlanLimitsDto {
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

export class CreatePlanDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(60)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsIn([
    'free',
    'trial',
    'premium',
    'extra_tokens',
    'custom',
    'subscription',
    'tokens',
  ])
  category:
    | 'free'
    | 'trial'
    | 'premium'
    | 'extra_tokens'
    | 'custom'
    | 'subscription'
    | 'tokens';

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  tokenLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dailyMessageLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyMessageLimit?: number;

  @IsOptional()
  features?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PlanLimitsDto)
  limits?: PlanLimitsDto;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isCustomizable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
