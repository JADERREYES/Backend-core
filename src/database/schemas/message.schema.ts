import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

export enum MessageType {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Chat', required: true })
  chatId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  senderId: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, enum: MessageType, default: MessageType.USER })
  type: MessageType;

  @Prop({ required: true })
  content: string;

  @Prop({ type: Object, default: {} })
  metadata: {
    tokens?: number;
    model?: string;
    sentiment?: string;
    processingTime?: number;
  };
}

export const MessageSchema = SchemaFactory.createForClass(Message);
