import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Alert extends Document {
  @Prop({
    type: String,
    enum: ['security', 'system', 'user', 'subscription'],
    default: 'system',
  })
  type: string;

  @Prop({
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  })
  severity: string;

  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  description: string;

  @Prop({
    type: String,
    enum: ['open', 'investigating', 'resolved'],
    default: 'open',
  })
  status: string;

  @Prop()
  assignedTo?: string;
}

export const AlertSchema = SchemaFactory.createForClass(Alert);
