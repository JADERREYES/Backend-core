import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseFilePipe,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { Response } from 'express';
import { DocumentsService } from './documents.service';
import { DocumentsProcessingService } from './documents-processing.service';
import { DocumentsRagService } from './documents-rag.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateExtractedTextDto } from './dto/update-extracted-text.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { StorageService } from '../../common/storage/storage.service';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly documentsProcessingService: DocumentsProcessingService,
    private readonly documentsRagService: DocumentsRagService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  async findAll() {
    return this.documentsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  @Get(':id/extracted-text')
  async getExtractedText(@Param('id') id: string) {
    const document = await this.documentsService.findOne(id);
    return {
      id: document.id,
      title: document.title,
      extractedText: document.extractedText || '',
      extractedTextLength: document.extractedTextLength || 0,
      systemStatus: document.systemStatus,
      extractionStatus: document.extractionStatus,
      processingStatus: document.processingStatus,
      processingError: document.processingError || '',
      indexingStatus: document.indexingStatus,
    };
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const document = await this.documentsService.findOne(id);

    const fileUrl = document.fileUrl || document.storagePath;

    if (!fileUrl) {
      return res.status(404).json({ message: 'Documento sin archivo adjunto' });
    }

    if (/^https?:\/\//i.test(fileUrl)) {
      return res.redirect(fileUrl);
    }

    return res.download(fileUrl, document.originalFileName || 'documento');
  }

  @Post(':id/reindex')
  async reindex(@Param('id') id: string) {
    return this.documentsProcessingService.scheduleProcessing(id, 'reindex');
  }

  @Post(':id/reprocess')
  async reprocess(@Param('id') id: string) {
    return this.documentsProcessingService.scheduleProcessing(id, 'full');
  }

  @Post()
  async create(@Body() payload: CreateDocumentDto) {
    return this.documentsService.create(payload);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const extension = extname(file.originalname).toLowerCase();
        const validMime = ALLOWED_MIME_TYPES.includes(file.mimetype);
        const validExtension = ALLOWED_EXTENSIONS.includes(extension);

        if (!validMime || !validExtension) {
          return cb(
            new BadRequestException('Solo se permiten archivos PDF y DOCX') as any,
            false,
          );
        }

        cb(null, true);
      },
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
      }),
    )
    file: any,
    @Body() payload: UploadDocumentDto,
  ) {
    const storedFile = await this.storageService.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      folder: 'documents',
      resourceType: 'raw',
    });

    return this.documentsService.createFromUpload(payload, {
      ...file,
      ...storedFile,
    });
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() payload: UpdateDocumentDto) {
    return this.documentsService.update(id, payload);
  }

  @Put(':id/extracted-text')
  async updateExtractedText(
    @Param('id') id: string,
    @Body() payload: UpdateExtractedTextDto,
  ) {
    return this.documentsRagService.updateExtractedText(
      id,
      payload.extractedText,
      payload.extractionStatus || 'completed',
      payload.extractionError || '',
    );
  }

  @Put(':id/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const extension = extname(file.originalname).toLowerCase();
        const validMime = ALLOWED_MIME_TYPES.includes(file.mimetype);
        const validExtension = ALLOWED_EXTENSIONS.includes(extension);

        if (!validMime || !validExtension) {
          return cb(
            new BadRequestException('Solo se permiten archivos PDF y DOCX') as any,
            false,
          );
        }

        cb(null, true);
      },
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async replaceUpload(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
      }),
    )
    file: any,
    @Body() payload: UploadDocumentDto,
  ) {
    const storedFile = await this.storageService.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      folder: 'documents',
      resourceType: 'raw',
    });

    return this.documentsService.replaceFile(id, payload, {
      ...file,
      ...storedFile,
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }
}
