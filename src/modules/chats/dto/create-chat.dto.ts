import { IsString, IsOptional } from 'class-validator';

export class CreateChatDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  status?: string;
}
