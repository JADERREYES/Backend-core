import { IsIn, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class RequestTwoFactorDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsOptional()
  @IsIn(['email', 'sms'])
  method?: 'email' | 'sms';
}

export class ConfirmTwoFactorDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code: string;
}

export class DisableTwoFactorDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;
}
