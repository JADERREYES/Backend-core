import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type ProfileDocument = HydratedDocument<Profile>;

@Schema({ timestamps: true })
export class Profile {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  displayName: string;

  @Prop({ default: '' })
  pronouns: string;

  @Prop({ type: Object, default: {} })
  preferences: {
    theme?: 'light' | 'dark';
    language?: string;
    notifications?: boolean;
  };

  @Prop({ type: Object, default: {} })
  onboardingData: {
    completed: boolean;
    step: number;
    interests?: string[];
    goals?: string[];
  };

  @Prop({ default: false })
  onboardingCompleted: boolean;

  @Prop({ default: '' })
  avatarUrl: string;

  @Prop({ default: '' })
  bio: string;
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);
