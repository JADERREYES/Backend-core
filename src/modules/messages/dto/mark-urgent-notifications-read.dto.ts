import { IsOptional, IsString } from 'class-validator';

export class MarkUrgentNotificationsReadDto {
  @IsOptional()
  @IsString()
  chatId?: string;
}
