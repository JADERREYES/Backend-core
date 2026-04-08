import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateReminderDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['daily', 'weekly', 'custom'])
  frequency?: string;

  @IsOptional()
  @IsArray()
  daysOfWeek?: string[];

  @IsString()
  time: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  tone?: string;
}
