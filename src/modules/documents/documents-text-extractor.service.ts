import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import * as mammoth from 'mammoth';
const pdfParse = require('pdf-parse');

@Injectable()
export class DocumentsTextExtractorService {
  async extractFromFile(filePath: string, mimeType?: string) {
    const fileBuffer = await readFile(filePath);
    const extension = extname(filePath).toLowerCase();

    if (
      mimeType === 'application/pdf' ||
      extension === '.pdf'
    ) {
      const parsed = await pdfParse(fileBuffer);
      return this.normalizeText(parsed.text || '');
    }

    if (
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      extension === '.docx'
    ) {
      const parsed = await mammoth.extractRawText({ buffer: fileBuffer });
      return this.normalizeText(parsed.value || '');
    }

    throw new Error('Formato de archivo no soportado para extraccion');
  }

  normalizeText(text: string) {
    return text
      .replace(/\u0000/g, ' ')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }
}
