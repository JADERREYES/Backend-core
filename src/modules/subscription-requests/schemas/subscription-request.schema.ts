import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class SubscriptionRequest extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userName: string;

  @Prop({ required: true })
  userEmail: string;

  @Prop({ default: 'free' })
  currentPlanCode: string;

  @Prop({
    type: {
      used: { type: Number, default: 0 },
      limit: { type: Number, default: 100 },
    },
    default: {},
  })
  currentUsage: {
    used: number;
    limit: number;
  };

  @Prop({ type: Types.ObjectId, ref: 'Plan', required: true })
  planId: Types.ObjectId;

  @Prop({ required: true })
  planName: string;

  @Prop({ required: true })
  planCode: string;

  @Prop({ default: '' })
  requestedPlanCode: string;

  @Prop({ type: Number, default: 0 })
  requestedTokens: number;

  @Prop({
    required: true,
    enum: ['free', 'premium', 'extra_tokens', 'custom'],
  })
  requestType: string;

  @Prop({
    type: {
      price: { type: Number, default: 0 },
      currency: { type: String, default: 'COP' },
      durationDays: { type: Number, default: 30 },
      limits: {
        maxChatsPerMonth: { type: Number, default: 10 },
        maxMessagesPerMonth: { type: Number, default: 100 },
        maxDocumentsMB: { type: Number, default: 50 },
        monthlyTokens: { type: Number, default: 100 },
        extraTokens: { type: Number, default: 0 },
      },
    },
    default: {},
  })
  planSnapshot: {
    price: number;
    currency: string;
    durationDays: number;
    limits: Record<string, number>;
  };

  @Prop({ type: Types.ObjectId, ref: 'PaymentMethod', required: true })
  paymentMethodId: Types.ObjectId;

  @Prop({
    type: {
      name: { type: String, default: '' },
      code: { type: String, default: '' },
      accountLabel: { type: String, default: '' },
      accountValue: { type: String, default: '' },
      holderName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      instructions: { type: String, default: '' },
    },
    default: {},
  })
  paymentMethodSnapshot: {
    name: string;
    code: string;
    accountLabel: string;
    accountValue: string;
    holderName: string;
    accountNumber: string;
    instructions: string;
  };

  @Prop({ default: '' })
  message: string;

  @Prop({ default: '' })
  proofUrl: string;

  @Prop({ default: '' })
  proofStorageProvider: string;

  @Prop({ default: '' })
  proofStorageKey: string;

  @Prop({ default: '' })
  proofFileUrl: string;

  @Prop({ default: '' })
  receiptUrl: string;

  @Prop({ default: '' })
  proofOriginalName: string;

  @Prop({ default: '' })
  receiptFileName: string;

  @Prop({ default: '' })
  proofMimeType: string;

  @Prop({ default: 0 })
  proofSize: number;

  @Prop({
    type: String,
    enum: [
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
    ],
    default: 'submitted',
  })
  status: string;

  @Prop({ default: '' })
  adminNotes: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reviewedBy?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  reviewedAt?: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'Subscription', default: null })
  activatedSubscriptionId?: Types.ObjectId | null;
}

export const SubscriptionRequestSchema =
  SchemaFactory.createForClass(SubscriptionRequest);
