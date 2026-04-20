import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RequestEmailChangeDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsEmail()
  @IsNotEmpty()
  newEmail: string;
}
