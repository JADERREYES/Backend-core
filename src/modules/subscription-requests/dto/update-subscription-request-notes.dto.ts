import { IsString, MaxLength } from 'class-validator';

export class UpdateSubscriptionRequestNotesDto {
  @IsString()
  @MaxLength(2000)
  adminNotes: string;
}
