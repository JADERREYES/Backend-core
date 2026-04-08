import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class SubscriptionActivation extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Subscription', required: true })
  subscriptionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Plan', default: null })
  planId?: Types.ObjectId | null;

  @Prop({ required: true })
  planName: string;

  @Prop({ required: true })
  planCode: string;

  @Prop({ required: true })
  planCategory: string;

  @Prop({ type: Number, default: 0 })
  amount: number;

  @Prop({ default: 'COP' })
  currency: string;

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
  limits: Record<string, number>;

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  endDate: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  approvedBy: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  approvedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'SubscriptionRequest', default: null })
  requestId?: Types.ObjectId | null;

  @Prop({ default: '' })
  adminNotes: string;
}

export const SubscriptionActivationSchema =
  SchemaFactory.createForClass(SubscriptionActivation);
