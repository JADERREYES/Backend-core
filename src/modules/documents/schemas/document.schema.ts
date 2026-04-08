import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongooseDocument } from 'mongoose';

@Schema({ timestamps: true })
export class AdminDocument extends MongooseDocument {
  @Prop({ required: true })
  title: string;

  @Prop({
    type: String,
    enum: ['terms', 'privacy', 'faq', 'guidelines', 'security'],
    default: 'terms',
  })
  category: string;

  @Prop({
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
  })
  status: string;

  @Prop({ default: '1.0.0' })
  version: string;

  @Prop({ default: 'Admin' })
  author: string;

  @Prop({ default: '' })
  content: string;

  @Prop({
    type: String,
    enum: ['manual', 'file'],
    default: 'manual',
  })
  sourceType: string;

  @Prop({ default: '' })
  originalFileName?: string;

  @Prop({ default: '' })
  storedFileName?: string;

  @Prop({ default: '' })
  mimeType?: string;

  @Prop({ default: 0 })
  fileSize?: number;

  @Prop({ default: '' })
  storagePath?: string;

  @Prop({ default: 'local' })
  storageProvider?: string;

  @Prop({
    type: String,
    enum: ['not_required', 'pending', 'processing', 'completed', 'failed'],
    default: 'not_required',
  })
  extractionStatus: string;

  @Prop({ default: '' })
  extractedText?: string;

  @Prop({ default: '' })
  extractionError?: string;

  @Prop({ type: Date, default: null })
  uploadedAt?: Date | null;

  @Prop({
    type: String,
    enum: ['uploaded', 'processing', 'processed', 'indexed', 'failed'],
    default: 'processed',
  })
  processingStatus: string;

  @Prop({ default: '' })
  processingError?: string;

  @Prop({ default: 0 })
  processingAttempts: number;

  @Prop({ type: Date, default: null })
  lastProcessedAt?: Date | null;

  @Prop({ type: Date, default: null })
  lastProcessingStartedAt?: Date | null;

  @Prop({
    type: String,
    enum: ['none', 'keyword', 'semantic'],
    default: 'none',
  })
  retrievalMode: string;

  @Prop({
    type: String,
    enum: ['not_indexed', 'processing', 'completed', 'failed'],
    default: 'not_indexed',
  })
  indexingStatus: string;

  @Prop({ default: 0 })
  chunkCount: number;

  @Prop({ default: 0 })
  extractedTextLength: number;

  @Prop({ default: '' })
  embeddingModel?: string;

  @Prop({ type: Date, default: null })
  lastIndexedAt?: Date | null;
}

export const AdminDocumentSchema =
  SchemaFactory.createForClass(AdminDocument);
