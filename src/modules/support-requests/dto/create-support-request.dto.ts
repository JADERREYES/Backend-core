import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateSupportRequestDto {
  @IsString()
  subject: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsIn(['general', 'premium_plan', 'extra_tokens', 'custom_upgrade'])
  type?: 'general' | 'premium_plan' | 'extra_tokens' | 'custom_upgrade';
}
