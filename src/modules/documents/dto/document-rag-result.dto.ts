export class DocumentRagResultDto {
  contextUsed: boolean;
  retrievalMode: 'none' | 'keyword' | 'semantic';
  chunks: Array<{
    documentId: string;
    documentTitle: string;
    chunkIndex: number;
    text: string;
    score: number;
  }>;
}
