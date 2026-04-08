import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { AdminDocument } from './schemas/document.schema';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentsProcessingService } from './documents-processing.service';

const DOCUMENTS_UPLOAD_DIR = join(process.cwd(), 'uploads', 'documents');

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(AdminDocument.name)
    private documentModel: Model<AdminDocument>,
    private readonly documentsProcessingService: DocumentsProcessingService,
  ) {
    this.ensureUploadDir();
  }

  async findAll() {
    const documents = await this.documentModel
      .find()
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    return documents.map((document: any) => this.serialize(document));
  }

  async findOne(id: string) {
    const document = await this.documentModel.findById(id).lean().exec();

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    return this.serialize(document, true);
  }

  async create(payload: CreateDocumentDto) {
    const document = new this.documentModel({
      ...payload,
      sourceType: 'manual',
      extractionStatus: 'not_required',
      processingStatus: 'uploaded',
    });
    const saved = await document.save();
    await this.documentsProcessingService.scheduleProcessing(
      saved._id.toString(),
      'full',
    );
    const queued = await this.documentModel.findById(saved._id).lean().exec();
    return this.serialize(queued || saved.toObject());
  }

  async createFromUpload(payload: UploadDocumentDto, file: any) {
    const document = new this.documentModel({
      title: payload.title || this.fileNameWithoutExtension(file.originalname),
      category: payload.category || 'terms',
      status: payload.status || 'draft',
      version: payload.version || '1.0.0',
      author: payload.author || 'Admin',
      content: payload.content || '',
      sourceType: 'file',
      originalFileName: file.originalname,
      storedFileName: file.filename,
      mimeType: file.mimetype,
      fileSize: file.size,
      storagePath: file.path,
      storageProvider: 'local',
      extractionStatus: 'pending',
      extractedText: '',
      extractionError: '',
      extractedTextLength: 0,
      uploadedAt: new Date(),
      processingStatus: 'uploaded',
    });

    const saved = await document.save();
    await this.documentsProcessingService.scheduleProcessing(
      saved._id.toString(),
      'full',
    );
    const queued = await this.documentModel.findById(saved._id).lean().exec();
    return this.serialize(queued || saved.toObject());
  }

  async update(id: string, payload: UpdateDocumentDto) {
    const updated = await this.documentModel
      .findByIdAndUpdate(id, { $set: payload }, { new: true })
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Documento no encontrado');
    }

    await this.documentsProcessingService.scheduleProcessing(id, 'full');
    const queued = await this.documentModel.findById(id).lean().exec();
    return this.serialize(queued || updated);
  }

  async replaceFile(id: string, payload: UploadDocumentDto, file: any) {
    const existing = await this.documentModel.findById(id).lean().exec();
    if (!existing) {
      throw new NotFoundException('Documento no encontrado');
    }

    this.deleteStoredFile(existing.storagePath);

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
            status: payload.status || existing.status || 'draft',
            version: payload.version || existing.version || '1.0.0',
            author: payload.author || existing.author || 'Admin',
            content: payload.content ?? existing.content ?? '',
            sourceType: 'file',
            originalFileName: file.originalname,
            storedFileName: file.filename,
            mimeType: file.mimetype,
            fileSize: file.size,
            storagePath: file.path,
            storageProvider: 'local',
            extractionStatus: 'pending',
            extractedText: '',
            extractionError: '',
            extractedTextLength: 0,
            uploadedAt: new Date(),
            processingStatus: 'uploaded',
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
    return this.serialize(queued || updated);
  }

  async remove(id: string) {
    const deleted = await this.documentModel.findByIdAndDelete(id).lean().exec();
    if (!deleted) {
      throw new NotFoundException('Documento no encontrado');
    }

    this.deleteStoredFile((deleted as any).storagePath);
    return { deleted: true };
  }

  getUploadRoot() {
    this.ensureUploadDir();
    return DOCUMENTS_UPLOAD_DIR;
  }

  private ensureUploadDir() {
    if (!existsSync(DOCUMENTS_UPLOAD_DIR)) {
      mkdirSync(DOCUMENTS_UPLOAD_DIR, { recursive: true });
    }
  }

  private deleteStoredFile(storagePath?: string) {
    if (storagePath && existsSync(storagePath)) {
      unlinkSync(storagePath);
    }
  }

  private fileNameWithoutExtension(fileName: string) {
    return fileName.replace(/\.[^/.]+$/, '');
  }

  private serialize(document: any, includeText = false) {
    const systemStatus = this.buildSystemStatus(document);

    return {
      ...document,
      extractedText: includeText ? document.extractedText || '' : undefined,
      id: document._id?.toString?.() || document.id,
      hasFile: !!document.storagePath,
      extractedTextAvailable: !!document.extractedText,
      systemStatus,
      lastUpdated: document.updatedAt || null,
    };
  }

  private buildSystemStatus(document: any) {
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

    if (document.sourceType === 'file' && extractionStatus === 'failed' && !extractedText) {
      return 'uploaded_not_extracted';
    }

    return 'processed';
  }
}
