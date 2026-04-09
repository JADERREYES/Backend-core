import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Plan extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, lowercase: true, unique: true })
  code: string;

  @Prop({ default: '', trim: true })
  description: string;

  @Prop({
    required: true,
    enum: ['free', 'trial', 'premium', 'extra_tokens', 'custom', 'subscription', 'tokens'],
    default: 'free',
  })
  category: string;

  @Prop({ type: Number, default: 0 })
  price: number;

  @Prop({ default: 'COP' })
  currency: string;

  @Prop({ type: Number, default: 30 })
  durationDays: number;

  @Prop({ type: Number, default: 100 })
  tokenLimit: number;

  @Prop({ type: Number, default: 0 })
  dailyMessageLimit: number;

  @Prop({ type: Number, default: 100 })
  monthlyMessageLimit: number;

  @Prop({ type: [String], default: [] })
  features: string[];

  @Prop({
    type: {
      maxChatsPerMonth: { type: Number, default: 10 },
      maxMessagesPerMonth: { type: Number, default: 100 },
      maxDocumentsMB: { type: Number, default: 50 },
      monthlyTokens: { type: Number, default: 100 },
      extraTokens: { type: Number, default: 0 },
    },
    default: {},
  })
  limits: {
    maxChatsPerMonth: number;
    maxMessagesPerMonth: number;
    maxDocumentsMB: number;
    monthlyTokens: number;
    extraTokens: number;
  };

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isDefault: boolean;

  @Prop({ default: false })
  isCustomizable: boolean;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: 0 })
  displayOrder: number;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);
