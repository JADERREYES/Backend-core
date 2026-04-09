import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Subscription extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Plan', default: null })
  planId?: Types.ObjectId | null;

  @Prop({ required: true, default: 'Free' })
  planName: string;

  @Prop({ required: true, default: 'free' })
  planCode: string;

  @Prop({
    type: String,
    enum: ['free', 'trial', 'premium', 'extra_tokens', 'custom'],
    default: 'free',
  })
  planCategory: string;

  @Prop({
    type: String,
    enum: ['active', 'expired', 'canceled', 'pending_activation'],
    default: 'active',
  })
  status: string;

  @Prop({ type: Number, default: 0 })
  amount: number;

  @Prop({ default: 'COP' })
  currency: string;

  @Prop({ default: '' })
  paymentMethodCode: string;

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

  @Prop({
    type: {
      chatsUsed: { type: Number, default: 0 },
      messagesUsed: { type: Number, default: 0 },
      documentsUsedMB: { type: Number, default: 0 },
      tokensUsed: { type: Number, default: 0 },
    },
    default: {},
  })
  currentUsage: {
    chatsUsed: number;
    messagesUsed: number;
    documentsUsedMB: number;
    tokensUsed: number;
  };

  @Prop({ type: Date, default: Date.now })
  startDate: Date;

  @Prop({ type: Date, default: Date.now })
  startedAt: Date;

  @Prop({
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  })
  endDate: Date;

  @Prop({
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  })
  expiresAt: Date;

  @Prop({ default: false })
  autoRenew: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  lastApprovedBy?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  grantedBy?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  lastApprovedAt?: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'SubscriptionRequest', default: null })
  sourceRequestId?: Types.ObjectId | null;

  @Prop({ type: Number, default: 100 })
  tokenLimit: number;

  @Prop({ type: Number, default: 100 })
  tokensRemaining: number;

  @Prop({ type: Number, default: 0 })
  dailyMessageLimit: number;

  @Prop({ type: Number, default: 100 })
  monthlyMessageLimit: number;

  @Prop({ default: '' })
  notes: string;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
