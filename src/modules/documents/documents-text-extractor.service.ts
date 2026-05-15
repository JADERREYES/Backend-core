import { Injectable, Logger } from '@nestjs/common';
import { extname } from 'path';
import * as mammoth from 'mammoth';
import { StorageService } from '../../common/storage/storage.service';

type ExtractionResult = {
  text: string;
  status: 'completed' | 'failed';
  error: string;
};

type LegacyPdfParser = (buffer: Buffer) => Promise<{ text?: string }>;
type PdfParserInstance = {
  getText: () => Promise<{ text?: string }>;
  destroy: () => Promise<void> | void;
};
type PdfParserConstructor = new (input: { data: Buffer }) => PdfParserInstance;
type PdfParseModule = {
  default?: unknown;
  PDFParse?: unknown;
};

const NULL_CHARACTER = String.fromCharCode(0);
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

@Injectable()
export class DocumentsTextExtractorService {
  private readonly logger = new Logger(DocumentsTextExtractorService.name);

  constructor(private readonly storageService: StorageService) {}

  async extractFromFile(
    filePath: string,
    mimeType?: string,
  ): Promise<ExtractionResult> {
    const fileBuffer = await this.storageService.read(filePath);

    if (!fileBuffer.length) {
      return {
        text: '',
        status: 'failed',
        error: 'El archivo esta vacio y no se puede indexar',
      };
    }

    if (fileBuffer.length > MAX_DOCUMENT_BYTES) {
      return {
        text: '',
        status: 'failed',
        error: 'El archivo supera el tamano maximo permitido para indexacion',
      };
    }

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
      .split(NULL_CHARACTER)
      .join(' ')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  private async extractDocxText(fileBuffer: Buffer): Promise<ExtractionResult> {
    try {
      const parsed = await mammoth.extractRawText({ buffer: fileBuffer });
      const text = this.normalizeText(parsed.value || '');

      if (!text) {
        return {
          text: '',
          status: 'failed',
          error: 'El archivo no contiene texto util para indexacion',
        };
      }

      return {
        text,
        status: 'completed',
        error: '',
      };
    } catch (error: unknown) {
      const message = this.getErrorMessage(error);
      this.logger.warn(
        `Fallo la extraccion DOCX para ${fileBuffer.length} bytes: ${message}`,
      );
      return {
        text: '',
        status: 'failed',
        error: message || 'No se pudo extraer texto del archivo DOCX',
      };
    }
  }

  private async extractPdfText(fileBuffer: Buffer): Promise<ExtractionResult> {
    let parsePdfText: ((buffer: Buffer) => Promise<string>) | undefined;

    try {
      const imported = (await import('pdf-parse')) as PdfParseModule;
      const legacyParser = this.isLegacyPdfParser(imported)
        ? imported
        : this.isLegacyPdfParser(imported.default)
          ? imported.default
          : undefined;

      if (legacyParser) {
        parsePdfText = async (buffer) => {
          const parsed = await legacyParser(buffer);
          return this.normalizeText(parsed?.text || '');
        };
      } else if (this.isPdfParserConstructor(imported.PDFParse)) {
        const PdfParse = imported.PDFParse;
        parsePdfText = async (buffer) => {
          const parser = new PdfParse({ data: buffer });

          try {
            const parsed = await parser.getText();
            return this.normalizeText(parsed?.text || '');
          } finally {
            try {
              await Promise.resolve(parser.destroy());
            } catch {
              // Best-effort cleanup for parser resources.
            }
          }
        };
      }
    } catch (error: unknown) {
      const message = this.getErrorMessage(error);
      this.logger.warn(
        `pdf-parse no pudo cargarse en este runtime: ${message}`,
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
      const text = await parsePdfText(fileBuffer);
      if (!text) {
        return {
          text: '',
          status: 'failed',
          error: 'El PDF no contiene texto extraible o esta compuesto solo por imagenes',
        };
      }

      return {
        text,
        status: 'completed',
        error: '',
      };
    } catch (error: unknown) {
      const message = this.getErrorMessage(error);
      this.logger.warn(
        `Fallo la extraccion PDF para ${fileBuffer.length} bytes: ${message}`,
      );
      return {
        text: '',
        status: 'failed',
        error: this.buildPdfExtractionError(error),
      };
    }
  }

  private buildPdfExtractionError(error: unknown) {
    const message = this.getErrorMessage(error);

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

  private getErrorMessage(error: unknown) {
    return error instanceof Error && error.message
      ? error.message
      : 'sin detalle';
  }

  private isLegacyPdfParser(value: unknown): value is LegacyPdfParser {
    return typeof value === 'function';
  }

  private isPdfParserConstructor(
    value: unknown,
  ): value is PdfParserConstructor {
    return typeof value === 'function';
  }
}
