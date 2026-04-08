import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument, Types } from 'mongoose';

@Schema({ timestamps: true })
export class DocumentChunk extends MongooseDocument {
  @Prop({ type: Types.ObjectId, ref: 'AdminDocument', required: true, index: true })
  documentId: Types.ObjectId;

  @Prop({ required: true })
  documentTitle: string;

  @Prop({ required: true })
  documentStatus: string;

  @Prop({ required: true })
  documentCategory: string;

  @Prop({ required: true })
  documentVersion: string;

  @Prop({ required: true })
  chunkIndex: number;

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
}

export const DocumentChunkSchema =
  SchemaFactory.createForClass(DocumentChunk);

DocumentChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });
