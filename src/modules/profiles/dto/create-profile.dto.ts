import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateProfileDto {
  @IsString()
  displayName: string;

  @IsOptional()
  @IsString()
  pronouns?: string;

  @IsOptional()
  @IsObject()
  preferences?: {
    theme?: 'light' | 'dark';
    language?: string;
    notifications?: boolean;
    palette?: string;
    backgroundStyle?: string;
    bubbleStyle?: string;
    motivationalIntensity?: string;
  };

  @IsOptional()
  @IsObject()
  onboardingData?: {
    completed?: boolean;
    step?: number;
    interests?: string[];
    goals?: string[];
  };

  @IsOptional()
  @IsBoolean()
  onboardingCompleted?: boolean;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  bio?: string;
}
