import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchRagDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;

  @IsOptional()
  @IsIn(['admin', 'user', 'system'])
  ownerType?: 'admin' | 'user' | 'system';
}
