import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'El correo electronico no es valido' })
  @IsNotEmpty({ message: 'El correo electronico es obligatorio' })
  email: string;

  @IsString({ message: 'La contrasena es obligatoria' })
  @IsNotEmpty({ message: 'La contrasena es obligatoria' })
  password: string;

  @IsOptional()
  @IsBoolean()
  adminOnly?: boolean;
}
