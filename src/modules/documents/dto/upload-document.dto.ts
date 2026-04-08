import { IsIn, IsOptional, IsString } from 'class-validator';

export class UploadDocumentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(['terms', 'privacy', 'faq', 'guidelines', 'security'])
  category?: 'terms' | 'privacy' | 'faq' | 'guidelines' | 'security';

  @IsOptional()
  @IsIn(['draft', 'published', 'archived'])
  status?: 'draft' | 'published' | 'archived';

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  content?: string;
}
