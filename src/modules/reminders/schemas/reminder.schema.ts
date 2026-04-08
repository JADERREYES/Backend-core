import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Reminder extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: String, enum: ['daily', 'weekly', 'custom'], default: 'daily' })
  frequency: string;

  @Prop({ type: [String], default: [] })
  daysOfWeek: string[];

  @Prop({ required: true })
  time: string;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ default: '' })
  tone: string;

  @Prop({ default: null })
  lastTriggeredAt?: Date | null;
}

export const ReminderSchema = SchemaFactory.createForClass(Reminder);
