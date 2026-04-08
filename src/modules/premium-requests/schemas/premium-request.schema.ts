import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class PremiumRequest extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true, default: 'free' })
  currentPlan: string;

  @Prop({
    type: {
      used: { type: Number, default: 0 },
      limit: { type: Number, default: 100 },
      usageRatio: { type: Number, default: 0 },
      upgradeRecommended: { type: Boolean, default: false },
    },
    default: {},
  })
  currentUsage: {
    used: number;
    limit: number;
    usageRatio: number;
    upgradeRecommended: boolean;
  };

  @Prop({
    type: String,
    enum: ['premium', 'extra_tokens', 'custom'],
    required: true,
  })
  requestType: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: String, default: 'nequi' })
  paymentMethod: string;

  @Prop({
    type: String,
    enum: ['new', 'contacted', 'pending_payment', 'paid', 'activated', 'rejected'],
    default: 'new',
  })
  status: string;

  @Prop({ default: '' })
  adminNotes: string;
}

export const PremiumRequestSchema = SchemaFactory.createForClass(PremiumRequest);
