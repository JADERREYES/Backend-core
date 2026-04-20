import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class SupportRequest extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  message: string;

  @Prop({
    type: String,
    enum: ['general', 'premium_plan', 'extra_tokens', 'custom_upgrade'],
    default: 'general',
  })
  type: string;

  @Prop({
    type: String,
    enum: ['open', 'in_progress', 'resolved'],
    default: 'open',
  })
  status: string;
}

export const SupportRequestSchema =
  SchemaFactory.createForClass(SupportRequest);
