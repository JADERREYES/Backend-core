import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class CreateMessageDto {
  @IsNotEmpty()
  @IsString()
  chatId: string;

  @IsNotEmpty()
  @IsString()
  senderId: string;  // ← USAR senderId

  @IsNotEmpty()
  @IsString()
  @IsIn(['user', 'assistant', 'system'])
  role: string;

  @IsNotEmpty()
  @IsString()
  content: string;
}