import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import IORedis from 'ioredis';
import { Queue, Worker, Job } from 'bullmq';
import { AdminDocument } from './schemas/document.schema';
import { DocumentsRagService } from './documents-rag.service';
import { DocumentsTextExtractorService } from './documents-text-extractor.service';

type ProcessingMode = 'full' | 'reindex';

type ProcessingJobData = {
  documentId: string;
  mode: ProcessingMode;
};

const DOCUMENTS_QUEUE_NAME = 'documents-processing';

@Injectable()
export class DocumentsProcessingService implements OnModuleDestroy {
  private readonly logger = new Logger(DocumentsProcessingService.name);
  private readonly redisUrl: string;
  private readonly queue?: Queue<ProcessingJobData>;
  private readonly worker?: Worker<ProcessingJobData>;
  private readonly redisConnection?: IORedis;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(AdminDocument.name)
    private readonly documentModel: Model<AdminDocument>,
    private readonly documentsRagService: DocumentsRagService,
    private readonly extractorService: DocumentsTextExtractorService,
  ) {
    this.redisUrl = this.configService.get<string>('REDIS_URL') || '';

    if (this.redisUrl) {
      this.redisConnection = new IORedis(this.redisUrl, {
        maxRetriesPerRequest: null,
      });

      this.queue = new Queue<ProcessingJobData>(DOCUMENTS_QUEUE_NAME, {
        connection: this.redisConnection,
      });

      this.worker = new Worker<ProcessingJobData>(
        DOCUMENTS_QUEUE_NAME,
        async (job) => this.processDocument(job.data.documentId, job.data.mode),
        {
          connection: this.redisConnection,
        },
      );

      this.worker.on('failed', (job, error) => {
        this.logger.error(
          `Job de documents fallido ${job?.id}: ${error?.message}`,
        );
      });
    }
  }

  async scheduleProcessing(documentId: string, mode: ProcessingMode = 'full') {
    await this.documentModel
      .findByIdAndUpdate(documentId, {
        $set: {
          processingStatus: 'uploaded',
          processingError: '',
        },
      })
      .exec();

    if (this.queue) {
      await this.queue.add(
        'process-document',
        { documentId, mode },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 50,
          removeOnFail: 50,
        },
      );
      return { queued: true, mode, transport: 'bullmq' };
    }

    setTimeout(() => {
      void this.processDocument(documentId, mode).catch((error) => {
        this.logger.error(
          `Procesamiento local fallido para ${documentId}: ${error?.message}`,
        );
      });
    }, 0);

    return { queued: true, mode, transport: 'local-fallback' };
  }

  async processDocument(documentId: string, mode: ProcessingMode = 'full') {
    const document = await this.documentModel
      .findById(documentId)
      .lean()
      .exec();
    if (!document) {
      throw new Error('Documento no encontrado');
    }

    await this.documentModel
      .findByIdAndUpdate(documentId, {
        $set: {
          processingStatus: 'processing',
          processingError: '',
          lastProcessingStartedAt: new Date(),
        },
        $inc: { processingAttempts: 1 },
      })
      .exec();

    try {
      let extractedText = document.extractedText || '';
      let extractionStatus = document.extractionStatus || 'not_required';
      let extractionError = '';
      let processingError = '';

      const fileLocation =
        document.storageKey || document.storagePath || document.fileUrl;

      if (mode === 'full' && document.sourceType === 'file' && fileLocation) {
        extractionStatus = 'processing';
        await this.documentModel
          .findByIdAndUpdate(documentId, {
            $set: { extractionStatus, extractionError: '' },
          })
          .exec();

        const extractionResult = await this.extractorService.extractFromFile(
          fileLocation,
          document.mimeType,
        );

        extractedText = extractionResult.text;
        extractionStatus = extractionResult.status;
        extractionError = extractionResult.error;
        processingError =
          extractionResult.status === 'failed' ? extractionResult.error : '';
      } else if (mode === 'full' && document.sourceType === 'manual') {
        extractedText = this.extractorService.normalizeText(
          document.content || '',
        );
        extractionStatus = 'not_required';
      }

      await this.documentModel
        .findByIdAndUpdate(documentId, {
          $set: {
            extractedText,
            extractedTextLength: extractedText.length,
            extractionStatus,
            extractionError,
            processingStatus: 'processed',
            processingError,
          },
        })
        .exec();

      await this.documentsRagService.indexDocument(documentId);

      await this.documentModel
        .findByIdAndUpdate(documentId, {
          $set: {
            processingStatus: 'indexed',
            processingError,
            lastProcessedAt: new Date(),
          },
        })
        .exec();

      return this.documentModel.findById(documentId).lean().exec();
    } catch (error: any) {
      await this.documentModel
        .findByIdAndUpdate(documentId, {
          $set: {
            processingStatus: 'failed',
            processingError: error?.message || 'Error de procesamiento',
            lastProcessedAt: new Date(),
          },
        })
        .exec();
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.redisConnection?.quit();
  }
}
