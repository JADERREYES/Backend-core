import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class PaymentMethod extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, lowercase: true, unique: true })
  code: string;

  @Prop({ default: '', trim: true })
  provider: string;

  @Prop({ default: '', trim: true })
  type: string;

  @Prop({ default: '', trim: true })
  accountNumber: string;

  @Prop({ default: '', trim: true })
  accountLabel: string;

  @Prop({ default: '', trim: true })
  accountValue: string;

  @Prop({ default: '', trim: true })
  accountHolder: string;

  @Prop({ default: '', trim: true })
  holderName: string;

  @Prop({ default: '', trim: true })
  instructions: string;

  @Prop({ default: '', trim: true })
  qrImageUrl: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: 0 })
  displayOrder: number;
}

export const PaymentMethodSchema = SchemaFactory.createForClass(PaymentMethod);
