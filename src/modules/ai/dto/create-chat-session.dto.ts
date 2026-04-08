import { IsOptional, IsString } from 'class-validator';

export class CreateChatSessionDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsOptional()
  @IsString()
  title?: string;
}
