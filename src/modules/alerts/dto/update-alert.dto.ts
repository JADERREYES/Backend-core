import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateAlertDto {
  @IsOptional()
  @IsIn(['security', 'system', 'user', 'subscription'])
  type?: 'security' | 'system' | 'user' | 'subscription';

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  severity?: 'low' | 'medium' | 'high' | 'critical';

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['open', 'investigating', 'resolved'])
  status?: 'open' | 'investigating' | 'resolved';

  @IsOptional()
  @IsString()
  assignedTo?: string;
}
