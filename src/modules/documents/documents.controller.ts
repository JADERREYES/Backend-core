import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  Logger,
  Param,
  ParseFilePipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { Request, Response } from 'express';
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
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { DocumentsUploadExceptionFilter } from './documents-upload-exception.filter';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];
const MAX_UPLOAD_FILE_SIZE_BYTES = 15 * 1024 * 1024;

type MulterCallback = (error: Error | null, acceptFile: boolean) => void;
type UploadedDocumentFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
  filename?: string;
};

const validateDocumentUpload = (
  _req: Request,
  file: UploadedDocumentFile,
  cb: MulterCallback,
) => {
  const extension = extname(file.originalname).toLowerCase();
  const validMime = ALLOWED_MIME_TYPES.includes(file.mimetype);
  const validExtension = ALLOWED_EXTENSIONS.includes(extension);

  if (!validMime || !validExtension) {
    cb(new BadRequestException('Solo se permiten archivos PDF y DOCX'), false);
    return;
  }

  cb(null, true);
};

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(
    private readonly documentsService: DocumentsService,
    private readonly documentsProcessingService: DocumentsProcessingService,
    private readonly documentsRagService: DocumentsRagService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    return this.documentsService.findAllPaginated({
      page,
      limit,
      search,
      status,
      category,
    });
  }

  @Get('rag/health')
  async getRagHealth() {
    return this.documentsRagService.getHealth();
  }

  @Get('rag/search')
  async searchRag(
    @Query('query') query: string,
    @Query('limit') limit?: string,
  ) {
    return this.documentsRagService.retrieveRelevantContext(
      query || '',
      Math.min(Math.max(Number(limit) || 5, 1), 10),
    );
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
      indexingError: document.indexingError || document.ragError || '',
      lastIndexedAt: document.lastIndexedAt || null,
      ragEnabled: document.ragEnabled,
      ragError: document.ragError || '',
    };
  }

  @Get(':id/chunks')
  async getChunks(@Param('id') id: string) {
    return this.documentsService.findChunks(id);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const document = await this.documentsService.findFileForDownload(id);
    const fileLocation = document.fileLocation;

    if (!fileLocation) {
      return res.status(404).json({ message: 'Documento sin archivo adjunto' });
    }

    const fileBuffer = await this.storageService.read(fileLocation);
    const fileName = document.fileName;

    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );

    if (document.mimeType) {
      res.setHeader('Content-Type', document.mimeType);
    }

    return res.send(fileBuffer);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
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
  @UseFilters(DocumentsUploadExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: validateDocumentUpload,
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
    }),
  )
  async upload(
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
      }),
    )
    file: UploadedDocumentFile,
    @Body() payload: UploadDocumentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.logger.log(
      `Upload request start user=${user.userId} email=${user.email} role=${user.role} file=${file.originalname} mime=${file.mimetype} size=${file.size}`,
    );

    if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      this.logger.warn(
        `Upload rejected by controller size user=${user.userId} file=${file.originalname} size=${file.size}`,
      );
      throw new BadRequestException(
        'El archivo excede el tamano maximo permitido de 15 MB',
      );
    }

    try {
      const storedFile = await this.storageService.upload({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        folder: 'documents',
        resourceType: 'raw',
      });

      const document = await this.documentsService.createFromUpload(
        payload,
        {
          ...file,
          ...storedFile,
        },
        { scheduleProcessing: false },
      );
      const processed = await this.documentsProcessingService.processDocument(
        document.id,
        'full',
      );

      this.logger.log(
        `Upload request completed user=${user.userId} documentId=${document.id} indexingStatus=${processed?.indexingStatus || 'unknown'} chunkCount=${processed?.chunkCount || 0}`,
      );

      return {
        ok: true,
        document: processed,
        rag: {
          indexed:
            processed?.indexingStatus === 'completed' &&
            processed?.ragEnabled !== false,
          chunksCreated: Number(processed?.chunkCount || 0),
        },
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido en upload';
      this.logger.error(
        `Upload request failed user=${user.userId} file=${file.originalname} mime=${file.mimetype} size=${file.size} reason=${message}`,
      );
      throw new InternalServerErrorException(
        `El archivo se recibio pero fallo el procesamiento o indexacion: ${message}`,
      );
    }
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

  @Put(':id/rag-status')
  async updateRagStatus(
    @Param('id') id: string,
    @Body('enabled') enabled: boolean,
  ) {
    if (typeof enabled !== 'boolean') {
      throw new BadRequestException('enabled debe ser boolean');
    }

    return this.documentsService.setRagEnabled(id, enabled);
  }

  @Put(':id/upload')
  @UseFilters(DocumentsUploadExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: validateDocumentUpload,
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
    }),
  )
  async replaceUpload(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
      }),
    )
    file: UploadedDocumentFile,
    @Body() payload: UploadDocumentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.logger.log(
      `Replace upload request start user=${user.userId} email=${user.email} documentId=${id} file=${file.originalname} mime=${file.mimetype} size=${file.size}`,
    );

    try {
      const storedFile = await this.storageService.upload({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        folder: 'documents',
        resourceType: 'raw',
      });

      const document = await this.documentsService.replaceFile(
        id,
        payload,
        {
          ...file,
          ...storedFile,
        },
        { scheduleProcessing: false },
      );
      const processed = await this.documentsProcessingService.processDocument(
        document.id,
        'full',
      );

      this.logger.log(
        `Replace upload request completed user=${user.userId} documentId=${document.id} indexingStatus=${processed?.indexingStatus || 'unknown'} chunkCount=${processed?.chunkCount || 0}`,
      );

      return {
        ok: true,
        document: processed,
        rag: {
          indexed:
            processed?.indexingStatus === 'completed' &&
            processed?.ragEnabled !== false,
          chunksCreated: Number(processed?.chunkCount || 0),
        },
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido en replaceUpload';
      this.logger.error(
        `Replace upload request failed user=${user.userId} documentId=${id} file=${file.originalname} mime=${file.mimetype} size=${file.size} reason=${message}`,
      );
      throw new InternalServerErrorException(
        `El archivo se recibio pero fallo el reprocesamiento o indexacion: ${message}`,
      );
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }
}
