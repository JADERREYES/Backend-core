import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { DocumentsRagService } from './documents-rag.service';

type QueryResult<T> = {
  lean: () => QueryResult<T>;
  exec: () => Promise<T>;
};

const queryResult = <T>(value: T): QueryResult<T> => ({
  lean: () => queryResult(value),
  exec: async () => value,
});

describe('DocumentsRagService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createConfigService = (config: Record<string, string> = {}) =>
    ({
      get: (key: string) => config[key],
    }) as ConfigService;

  it('does not delete existing chunks when new semantic indexing fails', async () => {
    const documentId = new Types.ObjectId();
    const documentModel = {
      findById: jest.fn(() =>
        queryResult({
          _id: documentId,
          title: 'Documento',
          status: 'published',
          category: 'faq',
          version: '1.0.0',
          content: 'Contenido estable para validar reindexado.',
          ragEnabled: true,
        }),
      ),
      findByIdAndUpdate: jest.fn(() => queryResult({ _id: documentId })),
    };
    const chunkModel = {
      deleteMany: jest.fn(() => queryResult({ deletedCount: 1 })),
      bulkWrite: jest.fn(),
      updateMany: jest.fn(() => queryResult({ modifiedCount: 0 })),
    };
    const service = new DocumentsRagService(
      createConfigService(),
      documentModel as never,
      chunkModel as never,
    );
    const serviceInternals = service as unknown as {
      openai?: unknown;
      generateEmbedding: jest.Mock;
    };

    serviceInternals.openai = {};
    serviceInternals.generateEmbedding = jest
      .fn()
      .mockRejectedValue(new Error('embedding failed'));

    await expect(service.indexDocument(documentId.toString())).rejects.toThrow(
      'embedding failed',
    );
    expect(chunkModel.deleteMany).not.toHaveBeenCalled();
    expect(chunkModel.bulkWrite).not.toHaveBeenCalled();
  });

  it('does not delete existing chunks when replacing the new index batch fails', async () => {
    const documentId = new Types.ObjectId();
    const documentModel = {
      findById: jest.fn(() =>
        queryResult({
          _id: documentId,
          title: 'Documento',
          status: 'published',
          category: 'faq',
          version: '1.0.0',
          content: 'Respirar lento ayuda durante ansiedad y miedo intenso.',
          ragEnabled: true,
        }),
      ),
      findByIdAndUpdate: jest.fn(() => queryResult({ _id: documentId })),
    };
    const chunkModel = {
      deleteMany: jest.fn(() => queryResult({ deletedCount: 1 })),
      bulkWrite: jest.fn().mockRejectedValue(new Error('write failed')),
      updateMany: jest.fn(() => queryResult({ modifiedCount: 0 })),
    };
    const service = new DocumentsRagService(
      createConfigService(),
      documentModel as never,
      chunkModel as never,
    );
    const serviceInternals = service as unknown as {
      openai?: unknown;
      generateEmbedding: jest.Mock;
    };

    serviceInternals.openai = {};
    serviceInternals.generateEmbedding = jest.fn().mockResolvedValue([1, 0]);

    await expect(service.indexDocument(documentId.toString())).rejects.toThrow(
      'write failed',
    );
    expect(chunkModel.bulkWrite).toHaveBeenCalled();
    expect(chunkModel.deleteMany).not.toHaveBeenCalled();
  });

  it('uses local semantic retrieval with embeddings instead of keyword fallback', async () => {
    const documentId = new Types.ObjectId();
    const documentModel = {};
    const chunkModel = {
      aggregate: jest.fn().mockRejectedValue(new Error('atlas unavailable')),
      find: jest.fn(() =>
        queryResult([
          {
            documentId,
            ownerType: 'admin',
            title: 'Respiracion',
            sourceFileName: 'respiracion.pdf',
            sourceType: 'pdf',
            chunkIndex: 0,
            totalChunks: 1,
            text: 'La respiracion diafragmatica ayuda a regular ansiedad.',
            documentStatus: 'published',
            retrievalMode: 'semantic',
            embedding: [0.98, 0.02],
            isActive: true,
          },
        ]),
      ),
    };
    const service = new DocumentsRagService(
      createConfigService(),
      documentModel as never,
      chunkModel as never,
    );
    const serviceInternals = service as unknown as {
      openai?: unknown;
      generateEmbedding: jest.Mock;
    };

    serviceInternals.openai = {};
    serviceInternals.generateEmbedding = jest.fn().mockResolvedValue([1, 0]);

    const result = await service.retrieveRelevantContext(
      'necesito calmar el cuerpo cuando aparece miedo',
      3,
    );

    expect(result.contextUsed).toBe(true);
    expect(result.retrievalMode).toBe('local_semantic');
    expect(result.chunks[0]?.documentTitle).toBe('Respiracion');
  });

  it('reports Atlas Vector Search as usable only after an observed vector result', async () => {
    const documentId = new Types.ObjectId();
    const documentModel = {};
    const chunkModel = {
      aggregate: jest.fn().mockResolvedValue([
        {
          documentId,
          title: 'Ansiedad',
          chunkIndex: 0,
          totalChunks: 1,
          text: 'Tecnicas de respiracion para manejo emocional.',
          sourceFileName: 'ansiedad.pdf',
          sourceType: 'pdf',
          ownerType: 'admin',
          score: 0.91,
        },
      ]),
    };
    const service = new DocumentsRagService(
      createConfigService({
        OPENAI_API_KEY: 'test-openai-key',
        MONGODB_ATLAS_VECTOR_INDEX: 'document_chunks_vector',
      }),
      documentModel as never,
      chunkModel as never,
    );
    const serviceInternals = service as unknown as {
      generateEmbedding: jest.Mock;
    };
    serviceInternals.generateEmbedding = jest.fn().mockResolvedValue([1, 0]);

    const result = await service.retrieveRelevantContext(
      'como recuperar control emocional',
      3,
    );

    expect(result.contextUsed).toBe(true);
    expect(result.retrievalMode).toBe('atlas_vector');
    expect(result.configuredRetrievalMode).toBe('atlas_vector');
    expect(result.atlasVectorStatus).toBe('usable');
    expect(chunkModel.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $vectorSearch: expect.objectContaining({
            index: 'document_chunks_vector',
            path: 'embedding',
          }),
        }),
      ]),
    );
  });

  it('matches accented Spanish terms in keyword fallback', async () => {
    const documentId = new Types.ObjectId();
    const documentModel = {};
    const chunkModel = {
      aggregate: jest.fn().mockRejectedValue(new Error('atlas unavailable')),
      find: jest.fn(() =>
        queryResult([
          {
            documentId,
            ownerType: 'admin',
            title: 'Acentos',
            sourceFileName: '',
            sourceType: 'manual',
            chunkIndex: 0,
            totalChunks: 1,
            text: 'La emoción, la niñez, la depresión y la acción importan.',
            documentStatus: 'published',
            retrievalMode: 'keyword',
            isActive: true,
          },
        ]),
      ),
    };
    const service = new DocumentsRagService(
      createConfigService(),
      documentModel as never,
      chunkModel as never,
    );

    const result = await service.retrieveRelevantContext(
      'emoción niñez depresión acción',
      3,
    );

    expect(result.contextUsed).toBe(true);
    expect(result.retrievalMode).toBe('keyword');
    expect(result.chunks[0]?.score).toBeGreaterThan(0);
  });
});
