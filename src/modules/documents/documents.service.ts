import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AdminDocument } from './schemas/document.schema';
import { DocumentChunk } from './schemas/document-chunk.schema';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentsProcessingService } from './documents-processing.service';
import { StorageService } from '../../common/storage/storage.service';
import {
  buildPaginatedResult,
  normalizePagination,
} from '../../common/pagination';

type DocumentListQuery = {
  page?: string | number;
  limit?: string | number;
  search?: string;
  status?: string;
  category?: string;
};

type LeanAdminDocument = Omit<Partial<AdminDocument>, '_id'> & {
  _id?: Types.ObjectId;
  id?: string;
  updatedAt?: Date | string;
};

export type SerializedAdminDocument = LeanAdminDocument & {
  id: string;
  fileUrl: string;
  hasFile: boolean;
  extractedText?: string;
  extractedTextAvailable: boolean;
  systemStatus: string;
  lastUpdated: Date | string | null;
  indexingError?: string;
};

type DocumentMutationOptions = {
  scheduleProcessing?: boolean;
};

export type UploadedStoredDocumentFile = {
  buffer?: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
  filename?: string;
  fileName?: string;
  provider?: 'local' | 'vercel-blob';
  fileUrl?: string;
  key?: string;
  resourceType?: string;
};

const getSavedDocumentId = (document: { id?: unknown }) => {
  if (typeof document.id === 'string') {
    return document.id;
  }

  throw new NotFoundException('Identificador de documento no disponible');
};

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(AdminDocument.name)
    private documentModel: Model<AdminDocument>,
    @InjectModel(DocumentChunk.name)
    private readonly chunkModel: Model<DocumentChunk>,
    private readonly documentsProcessingService: DocumentsProcessingService,
    private readonly storageService: StorageService,
  ) {}

  async findAll(): Promise<SerializedAdminDocument[]> {
    const documents = await this.documentModel
      .find()
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    return documents.map((document) =>
      this.serialize(document as LeanAdminDocument),
    );
  }

  async findAllPaginated(query: DocumentListQuery) {
    const { page, limit, skip } = normalizePagination(query);
    const filter: Record<string, unknown> = {};

    if (query.search?.trim()) {
      const search = query.search.trim();
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { originalFileName: { $regex: search, $options: 'i' } },
      ];
    }

    if (query.status && query.status !== 'all') {
      filter.status = query.status;
    }

    if (query.category && query.category !== 'all') {
      filter.category = query.category;
    }

    const [documents, total] = await Promise.all([
      this.documentModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.documentModel.countDocuments(filter).exec(),
    ]);

    return buildPaginatedResult(
      documents.map((document) =>
        this.serialize(document as LeanAdminDocument),
      ),
      page,
      limit,
      total,
    );
  }

  async findOne(id: string): Promise<SerializedAdminDocument> {
    const document = await this.documentModel.findById(id).lean().exec();

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    return this.serialize(document as LeanAdminDocument, true);
  }

  async findFileForDownload(id: string) {
    const document = await this.documentModel.findById(id).lean().exec();

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    const typedDocument = document as LeanAdminDocument;
    return {
      fileLocation:
        typedDocument.storageKey ||
        typedDocument.storagePath ||
        typedDocument.fileUrl ||
        '',
      fileName: typedDocument.originalFileName || 'documento',
      mimeType: typedDocument.mimeType || '',
    };
  }

  async findChunks(id: string) {
    const document = await this.documentModel.findById(id).lean().exec();

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    const chunks = await this.chunkModel
      .find({ documentId: new Types.ObjectId(id) })
      .sort({ chunkIndex: 1 })
      .lean()
      .exec();

    return {
      document: this.serialize(document as LeanAdminDocument),
      chunks: chunks.map((chunk) => ({
        id: String(chunk._id || ''),
        chunkIndex: Number(chunk.chunkIndex || 0),
        totalChunks: Number(chunk.totalChunks || 0),
        text: String(chunk.text || ''),
        sourceFileName: String(chunk.sourceFileName || ''),
        sourceType: String(chunk.sourceType || ''),
        ownerType: String(chunk.ownerType || 'admin'),
        isActive: chunk.isActive !== false,
        metadata: chunk.metadata || {},
      })),
    };
  }

  async create(payload: CreateDocumentDto) {
    const document = new this.documentModel({
      ...payload,
      ownerType: 'admin',
      ragEnabled: true,
      sourceType: 'manual',
      status: payload.status || 'published',
      extractionStatus: 'not_required',
      processingStatus: 'uploaded',
    });
    const saved = await document.save();
    await this.documentsProcessingService.scheduleProcessing(
      getSavedDocumentId(saved),
      'full',
    );
    const queued = await this.documentModel.findById(saved._id).lean().exec();
    return this.serialize((queued || saved.toObject()) as LeanAdminDocument);
  }

  async createFromUpload(
    payload: UploadDocumentDto,
    file: UploadedStoredDocumentFile,
    options: DocumentMutationOptions = {},
  ) {
    const document = new this.documentModel({
      ownerType: 'admin',
      ragEnabled: true,
      title: payload.title || this.fileNameWithoutExtension(file.originalname),
      category: payload.category || 'terms',
      status: payload.status || 'published',
      version: payload.version || '1.0.0',
      author: payload.author || 'Admin',
      content: payload.content || '',
      sourceType: 'file',
      originalFileName: file.originalname,
      storedFileName: file.fileName || file.filename || file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      storagePath: file.provider === 'local' ? file.key : file.fileUrl,
      fileUrl: file.fileUrl,
      storageProvider: file.provider,
      storageKey: file.key,
      storageResourceType: file.resourceType,
      extractionStatus: 'pending',
      extractedText: '',
      extractionError: '',
      extractedTextLength: 0,
      uploadedAt: new Date(),
      processingStatus: 'uploaded',
    });

    const saved = await document.save();
    if (options.scheduleProcessing !== false) {
      await this.documentsProcessingService.scheduleProcessing(
        getSavedDocumentId(saved),
        'full',
      );
    }

    const created = await this.documentModel.findById(saved._id).lean().exec();
    return this.serialize((created || saved.toObject()) as LeanAdminDocument);
  }

  async update(id: string, payload: UpdateDocumentDto) {
    const updated = await this.documentModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            ...payload,
            ...(payload.status === 'archived' ? { ragEnabled: false } : {}),
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Documento no encontrado');
    }

    await this.documentsProcessingService.scheduleProcessing(id, 'full');
    const queued = await this.documentModel.findById(id).lean().exec();
    return this.serialize((queued || updated) as LeanAdminDocument);
  }

  async replaceFile(
    id: string,
    payload: UploadDocumentDto,
    file: UploadedStoredDocumentFile,
    options: DocumentMutationOptions = {},
  ) {
    const existing = await this.documentModel.findById(id).lean().exec();
    if (!existing) {
      throw new NotFoundException('Documento no encontrado');
    }

    await this.deleteStoredFile(existing as LeanAdminDocument);

    const updated = await this.documentModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            title:
              payload.title ||
              existing.title ||
              this.fileNameWithoutExtension(file.originalname),
            category: payload.category || existing.category || 'terms',
            status: payload.status || existing.status || 'published',
            version: payload.version || existing.version || '1.0.0',
            author: payload.author || existing.author || 'Admin',
            content: payload.content ?? existing.content ?? '',
            sourceType: 'file',
            originalFileName: file.originalname,
            storedFileName: file.fileName || file.filename || file.originalname,
            mimeType: file.mimetype,
            fileSize: file.size,
            storagePath: file.provider === 'local' ? file.key : file.fileUrl,
            fileUrl: file.fileUrl,
            storageProvider: file.provider,
            storageKey: file.key,
            storageResourceType: file.resourceType,
            extractionStatus: 'pending',
            extractedText: '',
            extractionError: '',
            extractedTextLength: 0,
            uploadedAt: new Date(),
            processingStatus: 'uploaded',
            ragError: '',
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Documento no encontrado');
    }

    if (options.scheduleProcessing !== false) {
      await this.documentsProcessingService.scheduleProcessing(id, 'full');
    }
    const queued = await this.documentModel.findById(id).lean().exec();
    return this.serialize((queued || updated) as LeanAdminDocument);
  }

  async setRagEnabled(id: string, enabled: boolean) {
    const updated = await this.documentModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            ragEnabled: enabled,
            ragError: '',
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Documento no encontrado');
    }

    if (enabled) {
      await this.documentsProcessingService.scheduleProcessing(id, 'reindex');
    }

    return this.serialize(updated as LeanAdminDocument);
  }

  async remove(id: string) {
    const deleted = await this.documentModel
      .findByIdAndDelete(id)
      .lean()
      .exec();
    if (!deleted) {
      throw new NotFoundException('Documento no encontrado');
    }

    await this.deleteStoredFile(deleted as LeanAdminDocument);
    await this.chunkModel
      .deleteMany({ documentId: new Types.ObjectId(id) })
      .exec();
    return { deleted: true };
  }

  private async deleteStoredFile(document?: LeanAdminDocument) {
    if (!document?.storageKey) return;

    await this.storageService.delete(document.storageKey);
  }

  private fileNameWithoutExtension(fileName: string) {
    return fileName.replace(/\.[^/.]+$/, '');
  }

  private serialize(
    document: LeanAdminDocument,
    includeText = false,
  ): SerializedAdminDocument {
    const systemStatus = this.buildSystemStatus(document);
    const {
      storageKey: _storageKey,
      storagePath: _storagePath,
      ...safeDocument
    } = document;

    return {
      ...safeDocument,
      extractedText: includeText ? document.extractedText || '' : undefined,
      id: document._id?.toString() || document.id || '',
      fileUrl: this.safePublicFileUrl(document.fileUrl),
      hasFile: !!(
        document.fileUrl ||
        document.storagePath ||
        document.storageKey
      ),
      extractedTextAvailable: !!document.extractedText,
      systemStatus,
      lastUpdated: document.updatedAt || null,
      indexingError: String(document.ragError || ''),
    };
  }

  private buildSystemStatus(document: LeanAdminDocument) {
    const processingStatus = String(document.processingStatus || '');
    const extractionStatus = String(document.extractionStatus || '');
    const extractedText = String(document.extractedText || '').trim();

    if (
      processingStatus === 'uploaded' ||
      processingStatus === 'processing' ||
      extractionStatus === 'pending' ||
      extractionStatus === 'processing'
    ) {
      return 'pending';
    }

    if (processingStatus === 'failed') {
      return 'failed';
    }

    if (
      document.sourceType === 'file' &&
      extractionStatus === 'failed' &&
      !extractedText
    ) {
      return 'uploaded_not_extracted';
    }

    return 'processed';
  }

  private safePublicFileUrl(fileUrl?: string) {
    if (!fileUrl) return '';
    if (fileUrl.startsWith('/uploads/documents/')) return '';
    return fileUrl;
  }
}
