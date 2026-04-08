import { IsIn } from 'class-validator';

export class UpdateUserRoleDto {
  @IsIn(['user', 'superadmin'])
  role: 'user' | 'superadmin';
}
