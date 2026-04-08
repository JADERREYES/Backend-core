import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateExtractedTextDto {
  @IsString()
  extractedText: string;

  @IsOptional()
  @IsIn(['pending', 'processing', 'completed', 'failed'])
  extractionStatus?: 'pending' | 'processing' | 'completed' | 'failed';

  @IsOptional()
  @IsString()
  extractionError?: string;
}
