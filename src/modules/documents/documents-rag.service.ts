import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import OpenAI from 'openai';
import { AdminDocument } from './schemas/document.schema';
import { DocumentChunk } from './schemas/document-chunk.schema';

type RagChunk = {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  text: string;
  score: number;
};

@Injectable()
export class DocumentsRagService {
  private readonly logger = new Logger(DocumentsRagService.name);
  private readonly openai?: OpenAI;
  private readonly embeddingModel: string;
  private readonly atlasVectorIndex?: string;

  constructor(
    @InjectModel(AdminDocument.name)
    private readonly documentModel: Model<AdminDocument>,
    @InjectModel(DocumentChunk.name)
    private readonly chunkModel: Model<DocumentChunk>,
  ) {
    this.embeddingModel =
      process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    this.atlasVectorIndex = process.env.MONGODB_ATLAS_VECTOR_INDEX;

    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  async indexDocument(documentId: string) {
    const document = await this.documentModel.findById(documentId).lean().exec();

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    await this.documentModel
      .findByIdAndUpdate(documentId, {
        $set: { indexingStatus: 'processing' },
      })
      .exec();

    try {
      const sourceText = this.getIndexableText(document);

      await this.chunkModel
        .deleteMany({ documentId: new Types.ObjectId(documentId) })
        .exec();

      if (!sourceText) {
        const updated = await this.documentModel
          .findByIdAndUpdate(
            documentId,
            {
              $set: {
                indexingStatus: 'not_indexed',
                retrievalMode: 'none',
                chunkCount: 0,
                embeddingModel: '',
                lastIndexedAt: null,
              },
            },
            { new: true },
          )
          .lean()
          .exec();

        return updated;
      }

      const chunks = this.chunkText(sourceText);
      const supportsEmbeddings = !!this.openai;
      const chunkDocuments = [];

      for (let index = 0; index < chunks.length; index += 1) {
        const text = chunks[index];
        const embedding = supportsEmbeddings
          ? await this.generateEmbedding(text)
          : undefined;

        chunkDocuments.push({
          documentId: new Types.ObjectId(documentId),
          documentTitle: document.title,
          documentStatus: document.status,
          documentCategory: document.category,
          documentVersion: document.version || '1.0.0',
          chunkIndex: index,
          text,
          embedding,
          retrievalMode: embedding?.length ? 'semantic' : 'keyword',
          embeddingModel: embedding?.length ? this.embeddingModel : '',
          textLength: text.length,
        });
      }

      if (chunkDocuments.length) {
        await this.chunkModel.insertMany(chunkDocuments);
      }

      const retrievalMode =
        chunkDocuments.some(
          (chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length,
        )
          ? 'semantic'
          : 'keyword';

      const updated = await this.documentModel
        .findByIdAndUpdate(
          documentId,
          {
            $set: {
              indexingStatus: 'completed',
              retrievalMode,
              chunkCount: chunkDocuments.length,
              embeddingModel:
                retrievalMode === 'semantic' ? this.embeddingModel : '',
              lastIndexedAt: new Date(),
            },
          },
          { new: true },
        )
        .lean()
        .exec();

      return updated;
    } catch (error: any) {
      this.logger.error(
        `No se pudo indexar el documento ${documentId}`,
        error?.stack,
      );

      await this.documentModel
        .findByIdAndUpdate(documentId, {
          $set: {
            indexingStatus: 'failed',
            retrievalMode: 'none',
            embeddingModel: '',
          },
        })
        .exec();

      throw error;
    }
  }

  async updateExtractedText(
    documentId: string,
    extractedText: string,
    extractionStatus: 'pending' | 'processing' | 'completed' | 'failed',
    extractionError = '',
  ) {
    const updated = await this.documentModel
      .findByIdAndUpdate(
        documentId,
        {
          $set: {
            extractedText,
            extractedTextLength: extractedText.length,
            extractionStatus,
            extractionError,
            processingError:
              extractionStatus === 'failed' ? extractionError : '',
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Documento no encontrado');
    }

    await this.indexDocument(documentId);
    return this.documentModel.findById(documentId).lean().exec();
  }

  async retrieveRelevantContext(query: string, limit = 4) {
    if (!query?.trim()) {
      return {
        contextUsed: false,
        retrievalMode: 'none' as const,
        chunks: [] as RagChunk[],
      };
    }

    const canUseSemantic = !!this.openai;

    if (canUseSemantic && this.atlasVectorIndex) {
      try {
        const semantic = await this.retrieveWithAtlasVectorSearch(query, limit);
        if (semantic.length > 0) {
          return {
            contextUsed: true,
            retrievalMode: 'semantic' as const,
            chunks: semantic,
          };
        }
      } catch (error: any) {
        this.logger.warn(
          `Atlas Vector Search no disponible, fallback local: ${error?.message}`,
        );
      }
    }

    const chunks = await this.chunkModel
      .find({ documentStatus: 'published' })
      .lean()
      .exec();

    if (chunks.length === 0) {
      return {
        contextUsed: false,
        retrievalMode: 'none' as const,
        chunks: [] as RagChunk[],
      };
    }

    const semanticChunks = chunks.filter(
      (chunk: any) => Array.isArray(chunk.embedding) && chunk.embedding.length > 0,
    );

    if (canUseSemantic && semanticChunks.length > 0) {
      try {
        const queryEmbedding = await this.generateEmbedding(query);
        const ranked = semanticChunks
          .map((chunk: any) => ({
            documentId: chunk.documentId.toString(),
            documentTitle: chunk.documentTitle,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            score: this.cosineSimilarity(queryEmbedding || [], chunk.embedding),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .filter((chunk) => chunk.score > 0.2);

        if (ranked.length > 0) {
          return {
            contextUsed: true,
            retrievalMode: 'semantic' as const,
            chunks: ranked,
          };
        }
      } catch (error: any) {
        this.logger.warn(
          `Fallo embedding de consulta, usando fallback keyword: ${error?.message}`,
        );
      }
    }

    const queryTokens = this.tokenize(query);
    const ranked = chunks
      .map((chunk: any) => ({
        documentId: chunk.documentId.toString(),
        documentTitle: chunk.documentTitle,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        score: this.keywordScore(queryTokens, chunk.text),
      }))
      .filter((chunk) => chunk.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      contextUsed: ranked.length > 0,
      retrievalMode: ranked.length > 0 ? ('keyword' as const) : ('none' as const),
      chunks: ranked,
    };
  }

  private async retrieveWithAtlasVectorSearch(query: string, limit: number) {
    const queryEmbedding = await this.generateEmbedding(query);
    if (!queryEmbedding?.length) return [];

    const results = await this.chunkModel.aggregate([
      {
        $vectorSearch: {
          index: this.atlasVectorIndex,
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: Math.max(limit * 10, 20),
          limit,
          filter: {
            documentStatus: 'published',
          },
        },
      },
      {
        $project: {
          documentId: 1,
          documentTitle: 1,
          chunkIndex: 1,
          text: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ] as any[]);

    return results.map((chunk: any) => ({
      documentId: chunk.documentId.toString(),
      documentTitle: chunk.documentTitle,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      score: Number(chunk.score || 0),
    }));
  }

  private getIndexableText(document: any) {
    const extracted = String(document.extractedText || '').trim();
    if (extracted) return extracted;

    const manualContent = String(document.content || '').trim();
    if (manualContent) return manualContent;

    return '';
  }

  private chunkText(text: string, maxLength = 1200, overlap = 200) {
    const cleanText = text.replace(/\r/g, '').trim();
    if (!cleanText) return [];

    const paragraphs = cleanText
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);

    const chunks: string[] = [];
    let current = '';

    for (const paragraph of paragraphs.length ? paragraphs : [cleanText]) {
      const next = current ? `${current}\n\n${paragraph}` : paragraph;

      if (next.length <= maxLength) {
        current = next;
        continue;
      }

      if (current) {
        chunks.push(current);
      }

      if (paragraph.length <= maxLength) {
        current = paragraph;
        continue;
      }

      let start = 0;
      while (start < paragraph.length) {
        const end = Math.min(start + maxLength, paragraph.length);
        chunks.push(paragraph.slice(start, end));
        start = Math.max(end - overlap, 0);
        if (end === paragraph.length) break;
      }

      current = '';
    }

    if (current) {
      chunks.push(current);
    }

    return chunks;
  }

  private async generateEmbedding(text: string) {
    if (!this.openai) return undefined;

    const response = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });

    return response.data[0]?.embedding;
  }

  private cosineSimilarity(a: number[], b: number[]) {
    if (!a.length || !b.length || a.length !== b.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (!normA || !normB) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private tokenize(text: string) {
    return text
      .toLowerCase()
      .split(/[^a-zA-Z0-9áéíóúñü]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4);
  }

  private keywordScore(tokens: string[], chunkText: string) {
    if (!tokens.length) return 0;
    const text = chunkText.toLowerCase();
    const matches = tokens.filter((token) => text.includes(token));
    return matches.length / tokens.length;
  }
}
