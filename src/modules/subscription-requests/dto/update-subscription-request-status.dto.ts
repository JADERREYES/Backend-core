import { IsIn } from 'class-validator';

export class UpdateSubscriptionRequestStatusDto {
  @IsIn([
    'pending',
    'submitted',
    'new',
    'receipt_uploaded',
    'under_review',
    'contacted',
    'pending_payment',
    'paid',
    'awaiting_validation',
    'approved',
    'rejected',
    'activated',
  ])
  status:
    | 'pending'
    | 'submitted'
    | 'new'
    | 'receipt_uploaded'
    | 'under_review'
    | 'contacted'
    | 'pending_payment'
    | 'paid'
    | 'awaiting_validation'
    | 'approved'
    | 'rejected'
    | 'activated';
}
