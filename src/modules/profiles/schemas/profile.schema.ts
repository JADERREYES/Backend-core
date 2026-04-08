import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Profile extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  displayName: string;

  @Prop()
  pronouns: string;

  @Prop({
    type: {
      theme: { type: String, enum: ['light', 'dark'], default: 'light' },
      language: { type: String, default: 'es' },
      notifications: { type: Boolean, default: true },
      palette: { type: String, default: 'aurora' },
      backgroundStyle: { type: String, default: 'mist' },
      bubbleStyle: { type: String, default: 'soft' },
      motivationalIntensity: { type: String, default: 'balanced' },
    },
    default: {},
  })
  preferences: {
    theme?: 'light' | 'dark';
    language?: string;
    notifications?: boolean;
    palette?: string;
    backgroundStyle?: string;
    bubbleStyle?: string;
    motivationalIntensity?: string;
  };

  @Prop({
    type: {
      completed: { type: Boolean, default: false },
      step: { type: Number, default: 1 },
      interests: { type: [String], default: [] },
      goals: { type: [String], default: [] },
    },
    default: {},
  })
  onboardingData: {
    completed: boolean;
    step: number;
    interests?: string[];
    goals?: string[];
  };

  @Prop({ default: '' })
  avatarUrl?: string;

  @Prop({ default: '' })
  avatarStorageProvider?: string;

  @Prop({ default: '' })
  avatarStorageKey?: string;

  @Prop({ default: '' })
  avatarFileName?: string;

  @Prop({ default: '' })
  avatarMimeType?: string;

  @Prop({ default: 0 })
  avatarSize?: number;

  @Prop({ default: '' })
  bio?: string;

  @Prop({
    type: [
      {
        mood: { type: String, required: true },
        energy: { type: String, default: 'steady' },
        note: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  checkIns: {
    mood: string;
    energy?: string;
    note?: string;
    createdAt: Date;
  }[];
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);
