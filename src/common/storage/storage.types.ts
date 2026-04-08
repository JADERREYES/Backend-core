export type StorageResourceType = 'image' | 'raw';

export type UploadFolder =
  | 'documents'
  | 'subscription-proofs'
  | 'avatars';

export type UploadToStorageInput = {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  folder: UploadFolder;
  resourceType: StorageResourceType;
};

export type StoredFile = {
  provider: 'local' | 'vercel-blob';
  url: string;
  fileUrl: string;
  key: string;
  resourceType: StorageResourceType;
  fileName: string;
  mimeType: string;
  size: number;
};
