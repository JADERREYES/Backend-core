import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';

@Schema({ timestamps: true, collection: 'usermemories' })
export class UserMemory extends MongooseDocument {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({
    required: true,
    enum: ['preference', 'goal', 'coping_strategy', 'support_context', 'summary'],
  })
  type: string;

  @Prop({ required: true })
  summary: string;

  @Prop({ default: 'chat' })
  source: string;

  @Prop({ default: 0.5 })
  confidence: number;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const UserMemorySchema = SchemaFactory.createForClass(UserMemory);
UserMemorySchema.index({ userId: 1, isActive: 1, createdAt: -1 });
