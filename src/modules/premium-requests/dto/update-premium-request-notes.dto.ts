import { IsString } from 'class-validator';

export class UpdatePremiumRequestNotesDto {
  @IsString()
  adminNotes: string;
}
