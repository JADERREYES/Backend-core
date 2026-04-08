import { IsIn } from 'class-validator';

export class UpdateAlertStatusDto {
  @IsIn(['open', 'investigating', 'resolved'])
  status: 'open' | 'investigating' | 'resolved';
}
