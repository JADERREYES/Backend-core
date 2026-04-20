import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
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

type LeanDocumentChunk = {
  documentId: Types.ObjectId;
  documentTitle: string;
  chunkIndex: number;
  text: string;
  embedding?: number[];
  retrievalMode?: string;
  documentStatus?: string;
};

type ChunkInsert = LeanDocumentChunk & {
  documentStatus: string;
  documentCategory: string;
  documentVersion: string;
  embedding?: number[];
  embeddingModel: string;
  textLength: number;
};

type VectorSearchResult = {
  documentId: Types.ObjectId;
  documentTitle: string;
  chunkIndex: number;
  text: string;
  score?: number;
};

type RetrievalMode = 'none' | 'keyword' | 'local_semantic' | 'atlas_vector';
type AtlasVectorStatus =
  | 'not_configured'
  | 'not_observed'
  | 'usable'
  | 'empty_result'
  | 'failed';

type IndexableDocument = {
  title?: string;
  status?: string;
  category?: string;
  version?: string;
  extractedText?: string;
  content?: string;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown error';

const getErrorStack = (error: unknown) =>
  error instanceof Error ? error.stack : undefined;

@Injectable()
export class DocumentsRagService {
  private readonly logger = new Logger(DocumentsRagService.name);
  private readonly openai?: OpenAI;
  private readonly embeddingModel: string;
  private readonly atlasVectorIndex?: string;
  private lastRetrievalMode: RetrievalMode = 'none';
  private lastRetrievalAt: Date | null = null;
  private lastAtlasVectorError = '';
  private lastFallbackReason = '';
  private atlasVectorStatus: AtlasVectorStatus = 'not_configured';

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(AdminDocument.name)
    private readonly documentModel: Model<AdminDocument>,
    @InjectModel(DocumentChunk.name)
    private readonly chunkModel: Model<DocumentChunk>,
  ) {
    this.embeddingModel =
      this.configService.get<string>('OPENAI_EMBEDDING_MODEL') ||
      'text-embedding-3-small';
    this.atlasVectorIndex =
      this.configService.get<string>('MONGODB_ATLAS_VECTOR_INDEX') || undefined;

    const openAiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (openAiApiKey) {
      this.openai = new OpenAI({ apiKey: openAiApiKey });
    }

    this.atlasVectorStatus = this.atlasVectorIndex
      ? 'not_observed'
      : 'not_configured';
  }

  async indexDocument(documentId: string) {
    const document = await this.documentModel
      .findById(documentId)
      .lean()
      .exec();

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

      if (!sourceText) {
        await this.chunkModel
          .deleteMany({ documentId: new Types.ObjectId(documentId) })
          .exec();

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
      const chunkDocuments: ChunkInsert[] = [];

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
        await this.replaceDocumentChunks(documentId, chunkDocuments);
      }

      const retrievalMode = chunkDocuments.some(
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
    } catch (error: unknown) {
      this.logger.error(
        `No se pudo indexar el documento ${documentId}`,
        getErrorStack(error),
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
      return this.withRetrievalDiagnostics({
        contextUsed: false,
        retrievalMode: 'none' as const,
        configuredRetrievalMode: this.getConfiguredRetrievalMode(),
        atlasVectorStatus: this.atlasVectorStatus,
        fallbackReason: 'empty_query',
        chunks: [] as RagChunk[],
      });
    }

    const canUseSemantic = !!this.openai;

    if (canUseSemantic && this.atlasVectorIndex) {
      try {
        const semantic = await this.retrieveWithAtlasVectorSearch(query, limit);
        if (semantic.length > 0) {
          this.lastAtlasVectorError = '';
          this.lastFallbackReason = '';
          this.atlasVectorStatus = 'usable';
          return this.withRetrievalDiagnostics({
            contextUsed: true,
            retrievalMode: 'atlas_vector' as const,
            configuredRetrievalMode: this.getConfiguredRetrievalMode(),
            atlasVectorStatus: this.atlasVectorStatus,
            fallbackReason: '',
            chunks: semantic,
          });
        }

        this.atlasVectorStatus = 'empty_result';
        this.lastFallbackReason = 'atlas_vector_empty_result';
      } catch (error: unknown) {
        this.lastAtlasVectorError = getErrorMessage(error);
        this.lastFallbackReason = 'atlas_vector_failed';
        this.atlasVectorStatus = 'failed';
        this.logger.warn(
          `Atlas Vector Search no disponible, fallback local: ${getErrorMessage(error)}`,
        );
      }
    }

    const chunks = await this.chunkModel
      .find({ documentStatus: 'published' })
      .lean()
      .exec();

    if (chunks.length === 0) {
      return this.withRetrievalDiagnostics({
        contextUsed: false,
        retrievalMode: 'none' as const,
        configuredRetrievalMode: this.getConfiguredRetrievalMode(),
        atlasVectorStatus: this.atlasVectorStatus,
        fallbackReason: this.lastFallbackReason || 'no_indexed_chunks',
        chunks: [] as RagChunk[],
      });
    }

    const typedChunks = chunks as LeanDocumentChunk[];
    const semanticChunks = typedChunks.filter(
      (chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length > 0,
    );

    if (canUseSemantic && semanticChunks.length > 0) {
      try {
        const queryEmbedding = await this.generateEmbedding(query);
        const ranked = semanticChunks
          .map((chunk) => ({
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
          return this.withRetrievalDiagnostics({
            contextUsed: true,
            retrievalMode: 'local_semantic' as const,
            configuredRetrievalMode: this.getConfiguredRetrievalMode(),
            atlasVectorStatus: this.atlasVectorStatus,
            fallbackReason: this.lastFallbackReason,
            chunks: ranked,
          });
        }
      } catch (error: unknown) {
        this.lastFallbackReason = 'local_semantic_failed';
        this.logger.warn(
          `Fallo embedding de consulta, usando fallback keyword: ${getErrorMessage(error)}`,
        );
      }
    }

    const queryTokens = this.tokenizeUnicode(query);
    const ranked = typedChunks
      .map((chunk) => ({
        documentId: chunk.documentId.toString(),
        documentTitle: chunk.documentTitle,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        score: this.keywordScore(queryTokens, chunk.text),
      }))
      .filter((chunk) => chunk.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return this.withRetrievalDiagnostics({
      contextUsed: ranked.length > 0,
      retrievalMode:
        ranked.length > 0 ? ('keyword' as const) : ('none' as const),
      configuredRetrievalMode: this.getConfiguredRetrievalMode(),
      atlasVectorStatus: this.atlasVectorStatus,
      fallbackReason:
        ranked.length > 0
          ? this.lastFallbackReason || 'keyword_fallback'
          : 'no_relevant_context',
      chunks: ranked,
    });
  }

  async getHealth() {
    const [
      totalDocuments,
      indexedDocuments,
      processingDocuments,
      failedDocuments,
      totalChunks,
      semanticChunks,
      keywordChunks,
    ] = await Promise.all([
      this.documentModel.countDocuments().exec(),
      this.documentModel
        .countDocuments({
          processingStatus: 'indexed',
          indexingStatus: 'completed',
        })
        .exec(),
      this.documentModel
        .countDocuments({
          $or: [
            { processingStatus: 'uploaded' },
            { processingStatus: 'processing' },
            { indexingStatus: 'processing' },
          ],
        })
        .exec(),
      this.documentModel
        .countDocuments({
          $or: [{ processingStatus: 'failed' }, { indexingStatus: 'failed' }],
        })
        .exec(),
      this.chunkModel.countDocuments().exec(),
      this.chunkModel.countDocuments({ retrievalMode: 'semantic' }).exec(),
      this.chunkModel.countDocuments({ retrievalMode: 'keyword' }).exec(),
    ]);

    return {
      totalDocuments,
      indexedDocuments,
      processingDocuments,
      failedDocuments,
      totalChunks,
      semanticChunks,
      keywordChunks,
      embeddingsConfigured: !!this.openai,
      embeddingModel: this.openai ? this.embeddingModel : '',
      atlasVectorIndexConfigured: !!this.atlasVectorIndex,
      atlasVectorIndex: this.atlasVectorIndex || '',
      atlasVectorStatus: this.atlasVectorStatus,
      atlasVectorIndexUsable: this.atlasVectorStatus === 'usable',
      semanticChunksAvailable: semanticChunks > 0,
      configuredRetrievalMode: this.getConfiguredRetrievalMode(),
      observedRetrievalMode: this.lastRetrievalMode,
      effectiveRetrievalMode: this.lastRetrievalMode,
      lastRetrievalMode: this.lastRetrievalMode,
      lastRetrievalAt: this.lastRetrievalAt,
      lastAtlasVectorError: this.lastAtlasVectorError,
      lastFallbackReason: this.lastFallbackReason,
      generatedAt: new Date(),
    };
  }

  private async retrieveWithAtlasVectorSearch(query: string, limit: number) {
    const queryEmbedding = await this.generateEmbedding(query);
    if (!queryEmbedding?.length) return [];

    const pipeline = [
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
    ] as unknown as PipelineStage[];

    const results =
      await this.chunkModel.aggregate<VectorSearchResult>(pipeline);

    return results.map((chunk) => ({
      documentId: chunk.documentId.toString(),
      documentTitle: chunk.documentTitle,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      score: Number(chunk.score || 0),
    }));
  }

  private getIndexableText(document: IndexableDocument) {
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

  private async replaceDocumentChunks(
    documentId: string,
    chunkDocuments: ChunkInsert[],
  ) {
    const objectId = new Types.ObjectId(documentId);
    await this.chunkModel.bulkWrite(
      chunkDocuments.map((chunk) => ({
        replaceOne: {
          filter: {
            documentId: objectId,
            chunkIndex: chunk.chunkIndex,
          },
          replacement: chunk,
          upsert: true,
        },
      })),
    );

    await this.chunkModel
      .deleteMany({
        documentId: objectId,
        chunkIndex: { $gte: chunkDocuments.length },
      })
      .exec();
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

  private tokenizeUnicode(text: string) {
    return text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4);
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

  private withRetrievalDiagnostics<
    TResult extends {
      retrievalMode: RetrievalMode;
    },
  >(result: TResult) {
    this.lastRetrievalMode = result.retrievalMode;
    this.lastRetrievalAt = new Date();
    return result;
  }

  private getConfiguredRetrievalMode(): RetrievalMode {
    if (this.openai && this.atlasVectorIndex) return 'atlas_vector';
    if (this.openai) return 'local_semantic';
    return 'keyword';
  }
}
