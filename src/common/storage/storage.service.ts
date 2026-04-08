import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { del, put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import {
  StoredFile,
  StorageResourceType,
  UploadFolder,
  UploadToStorageInput,
} from './storage.types';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly provider: 'local' | 'vercel-blob';
  private readonly blobToken: string;

  constructor(private readonly configService: ConfigService) {
    const configuredProvider =
      this.configService.get<string>('STORAGE_PROVIDER') || '';
    this.blobToken =
      this.configService.get<string>('BLOB_READ_WRITE_TOKEN') ||
      process.env.BLOB_READ_WRITE_TOKEN ||
      '';

    const canUseBlob = !!this.blobToken;

    if (
      configuredProvider === 'vercel-blob' ||
      (canUseBlob && configuredProvider !== 'local')
    ) {
      this.provider = canUseBlob ? 'vercel-blob' : 'local';
    } else {
      this.provider = 'local';
    }
  }

  isLocalProvider() {
    return this.provider === 'local';
  }

  async upload(input: UploadToStorageInput): Promise<StoredFile> {
    if (this.provider === 'vercel-blob') {
      return this.uploadToVercelBlob(input);
    }

    if (process.env.VERCEL || process.env.VERCEL_ENV) {
      throw new InternalServerErrorException(
        'Storage externo no configurado para produccion. Configura Vercel Blob en Vercel antes de subir archivos.',
      );
    }

    return this.uploadToLocal(input);
  }

  async delete(key?: string, resourceType: StorageResourceType = 'raw') {
    if (!key) return;

    if (this.provider === 'vercel-blob') {
      await this.deleteFromVercelBlob(key, resourceType);
      return;
    }

    if (existsSync(key)) {
      await unlink(key).catch(() => undefined);
    }
  }

  async read(location: string) {
    if (!location) {
      throw new InternalServerErrorException('Ubicacion de archivo no disponible');
    }

    if (/^https?:\/\//i.test(location)) {
      const response = await fetch(location);
      if (!response.ok) {
        throw new Error(`No se pudo descargar el archivo remoto (${response.status})`);
      }

      return Buffer.from(await response.arrayBuffer());
    }

    return readFile(location);
  }

  private async uploadToLocal(input: UploadToStorageInput): Promise<StoredFile> {
    const extension = extname(input.originalName).toLowerCase();
    const safeBase = input.originalName
      .replace(extension, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .slice(0, 60);
    const fileName = `${Date.now()}-${safeBase || randomUUID()}${extension}`;
    const targetDir = join(process.cwd(), 'uploads', input.folder);

    await mkdir(targetDir, { recursive: true });

    const absolutePath = join(targetDir, fileName);
    await writeFile(absolutePath, input.buffer);

    return {
      provider: 'local',
      url: `/uploads/${input.folder}/${fileName}`,
      fileUrl: `/uploads/${input.folder}/${fileName}`,
      key: absolutePath,
      resourceType: input.resourceType,
      fileName,
      mimeType: input.mimeType,
      size: input.buffer.length,
    };
  }

  private async uploadToVercelBlob(
    input: UploadToStorageInput,
  ): Promise<StoredFile> {
    const extension = extname(input.originalName).toLowerCase();
    const safeBase = input.originalName
      .replace(extension, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .slice(0, 60);
    const pathname = `${input.folder}/${Date.now()}-${safeBase || randomUUID()}${extension}`;

    const blob = await put(pathname, input.buffer, {
      access: 'public',
      addRandomSuffix: false,
      contentType: input.mimeType,
      token: this.blobToken,
    });

    return {
      provider: 'vercel-blob',
      url: blob.url,
      fileUrl: blob.url,
      key: blob.pathname,
      resourceType: input.resourceType,
      fileName: input.originalName,
      mimeType: input.mimeType,
      size: input.buffer.length,
    };
  }

  private async deleteFromVercelBlob(
    pathname: string,
    _resourceType: StorageResourceType,
  ) {
    try {
      await del(pathname, { token: this.blobToken });
    } catch (error: any) {
      this.logger.warn(
        `No se pudo eliminar blob remoto ${pathname}: ${error?.message || error}`,
      );
    }
  }
}
