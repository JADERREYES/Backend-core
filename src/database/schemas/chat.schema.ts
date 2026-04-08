import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type ChatDocument = HydratedDocument<Chat>;

export enum ChatStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  DELETED = 'deleted',
}

@Schema({ timestamps: true })
export class Chat {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ type: String, enum: ChatStatus, default: ChatStatus.ACTIVE })
  status: ChatStatus;

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Message' }],
    default: [],
  })
  messages: MongooseSchema.Types.ObjectId[];

  @Prop({ default: '' })
  lastMessage: string;

  @Prop()
  lastMessageTime: Date;

  @Prop({ default: false })
  isPinned: boolean;
}

export const ChatSchema = SchemaFactory.createForClass(Chat);
