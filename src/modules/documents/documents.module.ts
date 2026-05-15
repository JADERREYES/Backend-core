import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentsController } from './documents.controller';
import { DocumentsProcessingService } from './documents-processing.service';
import { DocumentsRagService } from './documents-rag.service';
import { DocumentsService } from './documents.service';
import { DocumentsTextExtractorService } from './documents-text-extractor.service';
import {
  DocumentChunk,
  DocumentChunkSchema,
} from './schemas/document-chunk.schema';
import {
  AdminDocument,
  AdminDocumentSchema,
} from './schemas/document.schema';
import { StorageModule } from '../../common/storage/storage.module';
import { RagController } from './rag.controller';

@Module({
  imports: [
    StorageModule,
    MongooseModule.forFeature([
      { name: AdminDocument.name, schema: AdminDocumentSchema },
      { name: DocumentChunk.name, schema: DocumentChunkSchema },
    ]),
  ],
  controllers: [DocumentsController, RagController],
  providers: [
    DocumentsService,
    DocumentsRagService,
    DocumentsTextExtractorService,
    DocumentsProcessingService,
  ],
  exports: [DocumentsService, DocumentsRagService, DocumentsProcessingService],
})
export class DocumentsModule {}
