export class DocumentRagResultDto {
  contextUsed: boolean;
  retrievalMode: 'none' | 'keyword' | 'local_semantic' | 'atlas_vector';
  chunks: Array<{
    documentId: string;
    documentTitle: string;
    chunkIndex: number;
    text: string;
    score: number;
  }>;
}
