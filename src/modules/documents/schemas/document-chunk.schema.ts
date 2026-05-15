import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument, Types } from 'mongoose';

@Schema({ timestamps: true })
export class DocumentChunk extends MongooseDocument {
  @Prop({ type: Types.ObjectId, ref: 'AdminDocument', required: true, index: true })
  documentId: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['admin', 'user', 'system'],
    required: true,
    index: true,
  })
  ownerType: string;

  @Prop({ default: null, index: true })
  tenantId?: string | null;

  @Prop({ default: null, index: true })
  organizationId?: string | null;

  @Prop({ default: null, index: true })
  userId?: string | null;

  @Prop({ required: true, index: true })
  title: string;

  @Prop({ default: '' })
  sourceFileName: string;

  @Prop({
    type: String,
    enum: ['pdf', 'txt', 'manual', 'chat_memory'],
    required: true,
    index: true,
  })
  sourceType: string;

  @Prop({ required: true })
  documentStatus: string;

  @Prop({ required: true })
  documentCategory: string;

  @Prop({ required: true })
  documentVersion: string;

  @Prop({ required: true })
  chunkIndex: number;

  @Prop({ required: true })
  totalChunks: number;

  @Prop({ required: true })
  text: string;

  @Prop({ type: [Number], default: undefined })
  embedding?: number[];

  @Prop({
    type: String,
    enum: ['keyword', 'semantic'],
    default: 'keyword',
  })
  retrievalMode: string;

  @Prop({ default: '' })
  embeddingModel?: string;

  @Prop({ default: 0 })
  textLength: number;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const DocumentChunkSchema =
  SchemaFactory.createForClass(DocumentChunk);

DocumentChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });
DocumentChunkSchema.index({
  ownerType: 1,
  tenantId: 1,
  userId: 1,
  isActive: 1,
});
