import { IsIn } from 'class-validator';

export class UpdatePremiumRequestStatusDto {
  @IsIn(['new', 'contacted', 'pending_payment', 'paid', 'activated', 'rejected'])
  status:
    | 'new'
    | 'contacted'
    | 'pending_payment'
    | 'paid'
    | 'activated'
    | 'rejected';
}
