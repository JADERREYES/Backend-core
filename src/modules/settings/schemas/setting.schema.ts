import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Setting extends Document {
  @Prop({ required: true, unique: true, default: 'global' })
  key: string;

  @Prop({ default: 'MenteAmiga-AI' })
  platformName: string;

  @Prop({ default: 'https://menteamiga.ai' })
  baseUrl: string;

  @Prop({ default: 'UTC-5' })
  timezone: string;

  @Prop({ default: 'es' })
  language: string;

  @Prop({ default: 20 })
  dailyLimit: number;

  @Prop({ default: 500 })
  monthlyLimit: number;
}

export const SettingSchema = SchemaFactory.createForClass(Setting);
