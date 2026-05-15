import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, PipelineStage, Types } from 'mongoose';
import OpenAI from 'openai';
import { AdminDocument } from './schemas/document.schema';
import { DocumentChunk } from './schemas/document-chunk.schema';

type ChunkOwnerType = 'admin' | 'user' | 'system';
type ChunkSourceType = 'pdf' | 'txt' | 'manual' | 'chat_memory';
type RetrievalMode = 'none' | 'keyword' | 'local_semantic' | 'atlas_vector';
type AtlasVectorStatus =
  | 'not_configured'
  | 'not_observed'
  | 'usable'
  | 'empty_result'
  | 'failed';

type RagChunk = {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  totalChunks: number;
  text: string;
  score: number;
  sourceFileName: string;
  sourceType: ChunkSourceType;
  ownerType: ChunkOwnerType;
  metadata?: Record<string, unknown>;
};

type VectorSearchResult = {
  documentId: Types.ObjectId;
  title: string;
  chunkIndex: number;
  totalChunks: number;
  text: string;
  score?: number;
  sourceFileName?: string;
  sourceType: ChunkSourceType;
  ownerType: ChunkOwnerType;
  metadata?: Record<string, unknown>;
};

type LeanDocumentChunk = {
  documentId: Types.ObjectId;
  ownerType: ChunkOwnerType;
  tenantId?: string | null;
  organizationId?: string | null;
  userId?: string | null;
  title: string;
  sourceFileName: string;
  sourceType: ChunkSourceType;
  documentStatus: string;
  documentCategory: string;
  documentVersion: string;
  chunkIndex: number;
  totalChunks: number;
  text: string;
  embedding?: number[];
  retrievalMode?: string;
  embeddingModel?: string;
  textLength?: number;
  metadata?: Record<string, unknown>;
  isActive?: boolean;
};

type ChunkInsert = LeanDocumentChunk;

type IndexableDocument = {
  _id?: Types.ObjectId;
  title?: string;
  status?: string;
  category?: string;
  version?: string;
  extractedText?: string;
  content?: string;
  originalFileName?: string;
  mimeType?: string;
  fileSize?: number;
  sourceType?: string;
  ragEnabled?: boolean;
  ownerType?: string;
  tenantId?: string | null;
  organizationId?: string | null;
  userId?: string | null;
};

export type RagSearchFilters = {
  ownerTypes?: ChunkOwnerType[];
  tenantId?: string;
  organizationId?: string;
  userId?: string;
  includeGlobalAdmin?: boolean;
};

const DEFAULT_CHUNK_TARGET_TOKENS = 850;
const DEFAULT_CHUNK_OVERLAP_TOKENS = 120;
const CHARS_PER_TOKEN_ESTIMATE = 4;

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
      this.configService.get<string>('MONGODB_ATLAS_VECTOR_INDEX') ||
      'vector_index';

    const openAiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (openAiApiKey) {
      this.openai = new OpenAI({ apiKey: openAiApiKey, timeout: 20000 });
    }

    this.atlasVectorStatus = this.atlasVectorIndex
      ? 'not_observed'
      : 'not_configured';
  }

  async indexDocument(documentId: string) {
    const document = await this.documentModel.findById(documentId).lean().exec();

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    await this.documentModel
      .findByIdAndUpdate(documentId, {
        $set: { indexingStatus: 'processing', ragError: '' },
      })
      .exec();

    try {
      const sourceText = this.getIndexableText(document);
      const ragEnabled = document.ragEnabled !== false;
      const shouldStayActive =
        ragEnabled && String(document.status || '') === 'published';

      if (!sourceText) {
        await this.setDocumentChunksActive(documentId, false);

        return await this.documentModel
          .findByIdAndUpdate(
            documentId,
            {
              $set: {
                indexingStatus: 'not_indexed',
                retrievalMode: 'none',
                chunkCount: 0,
                embeddingModel: '',
                lastIndexedAt: null,
                ragError: 'No hay texto util para indexar',
              },
            },
            { new: true },
          )
          .lean()
          .exec();
      }

      const chunks = this.chunkText(sourceText);
      if (!chunks.length) {
        throw new Error('No se pudieron generar chunks a partir del documento');
      }

      const supportsEmbeddings = !!this.openai;
      const sourceType = this.resolveChunkSourceType(document);
      const chunkDocuments: ChunkInsert[] = [];

      for (let index = 0; index < chunks.length; index += 1) {
        const text = chunks[index];
        const embedding = supportsEmbeddings
          ? await this.generateEmbedding(text)
          : undefined;

        chunkDocuments.push({
          documentId: new Types.ObjectId(documentId),
          ownerType: this.resolveOwnerType(document.ownerType),
          tenantId: document.tenantId || null,
          organizationId: document.organizationId || null,
          userId: document.userId || null,
          title: document.title || 'Documento',
          sourceFileName: document.originalFileName || '',
          sourceType,
          documentStatus: document.status || 'draft',
          documentCategory: document.category || 'guidelines',
          documentVersion: document.version || '1.0.0',
          chunkIndex: index,
          totalChunks: chunks.length,
          text,
          embedding,
          retrievalMode: embedding?.length ? 'semantic' : 'keyword',
          embeddingModel: embedding?.length ? this.embeddingModel : '',
          textLength: text.length,
          metadata: {
            category: document.category || 'guidelines',
            version: document.version || '1.0.0',
            mimeType: document.mimeType || '',
            fileSize: Number(document.fileSize || 0),
          },
          isActive: shouldStayActive,
        });
      }

      await this.replaceDocumentChunks(documentId, chunkDocuments);

      const retrievalMode = chunkDocuments.some(
        (chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length > 0,
      )
        ? 'semantic'
        : 'keyword';

      return await this.documentModel
        .findByIdAndUpdate(
          documentId,
          {
            $set: {
              indexingStatus: 'completed',
              retrievalMode: shouldStayActive ? retrievalMode : 'none',
              chunkCount: chunkDocuments.length,
              embeddingModel:
                retrievalMode === 'semantic' ? this.embeddingModel : '',
              lastIndexedAt: new Date(),
              ragError: shouldStayActive
                ? ''
                : 'Documento desactivado para RAG o no publicado',
            },
          },
          { new: true },
        )
        .lean()
        .exec();
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
            ragError: getErrorMessage(error),
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

  async retrieveRelevantContext(
    query: string,
    limit = 4,
    filters: RagSearchFilters = {},
  ) {
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

    const safeLimit = Math.min(Math.max(limit, 1), 10);
    const canUseSemantic = !!this.openai;

    if (canUseSemantic && this.atlasVectorIndex) {
      try {
        const semantic = await this.retrieveWithAtlasVectorSearch(
          query,
          safeLimit,
          filters,
        );

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

    const chunks = (await this.chunkModel
      .find(this.buildChunkMatch(filters))
      .lean()
      .exec()) as LeanDocumentChunk[];

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

    const semanticChunks = chunks.filter(
      (chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length > 0,
    );

    if (canUseSemantic && semanticChunks.length > 0) {
      try {
        const queryEmbedding = await this.generateEmbedding(query);
        const ranked = semanticChunks
          .map((chunk) => ({
            documentId: chunk.documentId.toString(),
            documentTitle: chunk.title,
            chunkIndex: chunk.chunkIndex,
            totalChunks: chunk.totalChunks,
            text: chunk.text,
            score: this.cosineSimilarity(queryEmbedding, chunk.embedding || []),
            sourceFileName: chunk.sourceFileName,
            sourceType: chunk.sourceType,
            ownerType: chunk.ownerType,
            metadata: chunk.metadata,
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, safeLimit)
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
    const ranked = chunks
      .map((chunk) => ({
        documentId: chunk.documentId.toString(),
        documentTitle: chunk.title,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
        text: chunk.text,
        score: this.keywordScore(queryTokens, chunk.text),
        sourceFileName: chunk.sourceFileName,
        sourceType: chunk.sourceType,
        ownerType: chunk.ownerType,
        metadata: chunk.metadata,
      }))
      .filter((chunk) => chunk.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, safeLimit);

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
    const activeChunkFilter = { isActive: true };

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
          ragEnabled: true,
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
      this.chunkModel.countDocuments(activeChunkFilter).exec(),
      this.chunkModel
        .countDocuments({ ...activeChunkFilter, retrievalMode: 'semantic' })
        .exec(),
      this.chunkModel
        .countDocuments({ ...activeChunkFilter, retrievalMode: 'keyword' })
        .exec(),
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

  private async retrieveWithAtlasVectorSearch(
    query: string,
    limit: number,
    filters: RagSearchFilters,
  ) {
    const queryEmbedding = await this.generateEmbedding(query);
    const pipeline = [
      {
        $vectorSearch: {
          index: this.atlasVectorIndex,
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: Math.max(limit * 12, 50),
          limit,
          filter: this.buildAtlasVectorFilter(filters),
        },
      },
      {
        $project: {
          documentId: 1,
          title: 1,
          chunkIndex: 1,
          totalChunks: 1,
          text: 1,
          sourceFileName: 1,
          sourceType: 1,
          ownerType: 1,
          metadata: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ] as unknown as PipelineStage[];

    const results = await this.chunkModel.aggregate<VectorSearchResult>(pipeline);

    return results.map((chunk) => ({
      documentId: chunk.documentId.toString(),
      documentTitle: chunk.title,
      chunkIndex: chunk.chunkIndex,
      totalChunks: chunk.totalChunks,
      text: chunk.text,
      score: Number(chunk.score || 0),
      sourceFileName: chunk.sourceFileName || '',
      sourceType: chunk.sourceType,
      ownerType: chunk.ownerType,
      metadata: chunk.metadata,
    }));
  }

  private getIndexableText(document: IndexableDocument) {
    const extracted = this.normalizeChunkText(String(document.extractedText || ''));
    if (extracted) return extracted;

    const manualContent = this.normalizeChunkText(String(document.content || ''));
    if (manualContent) return manualContent;

    return '';
  }

  private chunkText(
    text: string,
    targetTokens = DEFAULT_CHUNK_TARGET_TOKENS,
    overlapTokens = DEFAULT_CHUNK_OVERLAP_TOKENS,
  ) {
    const cleanText = this.normalizeChunkText(text);
    if (!cleanText) return [];

    const words = cleanText.split(/\s+/).filter(Boolean);
    if (!words.length) return [];

    const approxWordsPerChunk = Math.max(
      Math.floor((targetTokens * CHARS_PER_TOKEN_ESTIMATE) / 5),
      140,
    );
    const approxWordsOverlap = Math.min(
      Math.max(Math.floor((overlapTokens * CHARS_PER_TOKEN_ESTIMATE) / 5), 20),
      Math.floor(approxWordsPerChunk / 2),
    );

    const chunks: string[] = [];
    let start = 0;

    while (start < words.length) {
      const end = Math.min(start + approxWordsPerChunk, words.length);
      const chunk = words.slice(start, end).join(' ').trim();
      if (chunk) {
        chunks.push(chunk);
      }

      if (end >= words.length) {
        break;
      }

      start = Math.max(end - approxWordsOverlap, start + 1);
    }

    return chunks;
  }

  private normalizeChunkText(text: string) {
    return text
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  private async generateEmbedding(text: string) {
    const normalized = this.normalizeChunkText(text);
    if (!normalized) {
      throw new Error('No se puede generar embedding para texto vacio');
    }

    if (!this.openai) {
      return undefined;
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: normalized,
      });

      const embedding = response.data[0]?.embedding;
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('OpenAI no devolvio embedding valido');
      }

      return embedding;
    } catch (error: unknown) {
      throw new Error(`Fallo OpenAI embeddings: ${getErrorMessage(error)}`);
    }
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

  private async setDocumentChunksActive(documentId: string, active: boolean) {
    await this.chunkModel
      .updateMany(
        { documentId: new Types.ObjectId(documentId) },
        { $set: { isActive: active } },
      )
      .exec();
  }

  private buildChunkMatch(filters: RagSearchFilters): FilterQuery<DocumentChunk> {
    const clauses = this.buildScopedClauses(filters);
    if (clauses.length === 1) {
      return clauses[0];
    }

    return { $or: clauses };
  }

  private buildAtlasVectorFilter(filters: RagSearchFilters) {
    const clauses = this.buildScopedClauses(filters);
    if (clauses.length === 1) {
      return clauses[0];
    }

    return { $or: clauses };
  }

  private buildScopedClauses(filters: RagSearchFilters) {
    const ownerTypes = filters.ownerTypes?.length
      ? filters.ownerTypes
      : (['admin'] as ChunkOwnerType[]);
    const clauses: Array<Record<string, unknown>> = [];

    if (ownerTypes.includes('admin') && filters.includeGlobalAdmin !== false) {
      clauses.push(this.withScope({ ownerType: 'admin' }, filters));
    }

    if (ownerTypes.includes('user') && filters.userId) {
      clauses.push(
        this.withScope(
          {
            ownerType: 'user',
            userId: filters.userId,
          },
          filters,
        ),
      );
    }

    if (ownerTypes.includes('system')) {
      clauses.push(this.withScope({ ownerType: 'system' }, filters));
    }

    if (!clauses.length) {
      clauses.push(this.withScope({ ownerType: 'admin' }, filters));
    }

    return clauses.map((clause) => ({
      ...clause,
      documentStatus: 'published',
      isActive: true,
    }));
  }

  private withScope(
    base: Record<string, unknown>,
    filters: RagSearchFilters,
  ) {
    return {
      ...base,
      ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
      ...(filters.organizationId
        ? { organizationId: filters.organizationId }
        : {}),
    };
  }

  private resolveOwnerType(ownerType?: string): ChunkOwnerType {
    return ownerType === 'user' || ownerType === 'system' ? ownerType : 'admin';
  }

  private resolveChunkSourceType(document: IndexableDocument): ChunkSourceType {
    if (document.sourceType === 'manual') {
      return 'manual';
    }

    const mimeType = String(document.mimeType || '').toLowerCase();
    const fileName = String(document.originalFileName || '').toLowerCase();

    if (mimeType.includes('pdf') || fileName.endsWith('.pdf')) {
      return 'pdf';
    }

    return 'txt';
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
