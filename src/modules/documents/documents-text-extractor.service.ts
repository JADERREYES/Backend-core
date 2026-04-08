import { Injectable, Logger } from '@nestjs/common';
import { extname } from 'path';
import * as mammoth from 'mammoth';
import { StorageService } from '../../common/storage/storage.service';

type ExtractionResult = {
  text: string;
  status: 'completed' | 'failed';
  error: string;
};

@Injectable()
export class DocumentsTextExtractorService {
  private readonly logger = new Logger(DocumentsTextExtractorService.name);

  constructor(private readonly storageService: StorageService) {}

  async extractFromFile(filePath: string, mimeType?: string): Promise<ExtractionResult> {
    const fileBuffer = await this.storageService.read(filePath);
    const extension = extname(filePath).toLowerCase();

    if (mimeType === 'application/pdf' || extension === '.pdf') {
      return this.extractPdfText(fileBuffer);
    }

    if (
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      extension === '.docx'
    ) {
      return this.extractDocxText(fileBuffer);
    }

    return {
      text: '',
      status: 'failed',
      error: 'Formato de archivo no soportado para extraccion',
    };
  }

  normalizeText(text: string) {
    return text
      .replace(/\u0000/g, ' ')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  private async extractDocxText(fileBuffer: Buffer): Promise<ExtractionResult> {
    try {
      const parsed = await mammoth.extractRawText({ buffer: fileBuffer });
      return {
        text: this.normalizeText(parsed.value || ''),
        status: 'completed',
        error: '',
      };
    } catch (error: any) {
      this.logger.warn(
        `Fallo la extraccion DOCX para ${fileBuffer.length} bytes: ${error?.message || 'sin detalle'}`,
      );
      return {
        text: '',
        status: 'failed',
        error: error?.message || 'No se pudo extraer texto del archivo DOCX',
      };
    }
  }

  private async extractPdfText(fileBuffer: Buffer): Promise<ExtractionResult> {
    let parsePdfText: ((buffer: Buffer) => Promise<string>) | undefined;

    try {
      const imported = require('pdf-parse');
      const legacyParser =
        typeof imported === 'function'
          ? imported
          : typeof imported?.default === 'function'
            ? imported.default
            : undefined;

      if (legacyParser) {
        parsePdfText = async (buffer) => {
          const parsed = await legacyParser(buffer);
          return this.normalizeText(parsed?.text || '');
        };
      } else if (typeof imported?.PDFParse === 'function') {
        parsePdfText = async (buffer) => {
          const parser = new imported.PDFParse({ data: buffer });

          try {
            const parsed = await parser.getText();
            return this.normalizeText(parsed?.text || '');
          } finally {
            await parser.destroy().catch(() => undefined);
          }
        };
      }
    } catch (error: any) {
      this.logger.warn(
        `pdf-parse no pudo cargarse en este runtime: ${error?.message || 'sin detalle'}`,
      );
      return {
        text: '',
        status: 'failed',
        error:
          'Extraccion PDF no disponible en este runtime. El archivo se conserva subido sin tumbar el backend.',
      };
    }

    if (!parsePdfText) {
      this.logger.warn('pdf-parse se cargo, pero no expuso una API compatible');
      return {
        text: '',
        status: 'failed',
        error:
          'Extraccion PDF no compatible con este runtime. El archivo queda subido con degradacion segura.',
      };
    }

    try {
      return {
        text: await parsePdfText(fileBuffer),
        status: 'completed',
        error: '',
      };
    } catch (error: any) {
      this.logger.warn(
        `Fallo la extraccion PDF para ${fileBuffer.length} bytes: ${error?.message || 'sin detalle'}`,
      );
      return {
        text: '',
        status: 'failed',
        error: this.buildPdfExtractionError(error),
      };
    }
  }

  private buildPdfExtractionError(error: any) {
    const message = String(error?.message || '').trim();

    if (!message) {
      return 'No se pudo extraer texto del PDF. El archivo queda subido con degradacion segura.';
    }

    if (/invalid pdf/i.test(message)) {
      return 'El PDF fue subido, pero no se pudo extraer texto porque el archivo no tiene una estructura PDF valida o el runtime no pudo interpretarlo.';
    }

    if (/worker|canvas|module|import|require/i.test(message)) {
      return 'Extraccion PDF no disponible de forma robusta en este runtime. El archivo queda subido con degradacion segura.';
    }

    return `No se pudo extraer texto del PDF. ${message}`;
  }
}
