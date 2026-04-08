import { PartialType } from '@nestjs/mapped-types';
import { CreateMessageDto } from './create-message.dto';
import { IsOptional, IsString, IsNumber, IsObject } from 'class-validator';

export class UpdateMessageDto extends PartialType(CreateMessageDto) {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsNumber()
  tokensUsed?: number;

  @IsOptional()
  @IsObject()
  metadata?: {
    processingTimeMs?: number;
    model?: string;
  };
}
