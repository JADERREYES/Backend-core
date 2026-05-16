import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { del, put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { extname, join, resolve, sep } from 'path';
import {
  StoredFile,
  UploadFolder,
  UploadToStorageInput,
} from './storage.types';

const SENSITIVE_UPLOAD_FOLDERS: UploadFolder[] = [
  'documents',
  'subscription-proofs',
];

const isSensitiveFolder = (folder: UploadFolder) =>
  SENSITIVE_UPLOAD_FOLDERS.includes(folder);

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

  async delete(key?: string) {
    if (!key) return;

    if (this.provider === 'vercel-blob') {
      await this.deleteFromVercelBlob(key);
      return;
    }

    const localPath = this.resolveLocalReadPath(key);
    if (existsSync(localPath)) {
      await unlink(localPath).catch(() => undefined);
    }
  }

  async read(location: string) {
    if (!location) {
      throw new InternalServerErrorException(
        'Ubicacion de archivo no disponible',
      );
    }

    if (/^https?:\/\//i.test(location)) {
      this.assertAllowedRemoteUrl(location);
      const response = await fetch(location);
      if (!response.ok) {
        throw new Error(
          `No se pudo descargar el archivo remoto (${response.status})`,
        );
      }

      return Buffer.from(await response.arrayBuffer());
    }

    return readFile(this.resolveLocalReadPath(location));
  }

  private async uploadToLocal(
    input: UploadToStorageInput,
  ): Promise<StoredFile> {
    const extension = extname(input.originalName).toLowerCase();
    const safeBase = (input.targetBaseName || input.originalName.replace(extension, ''))
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
    const fileName = `${safeBase || randomUUID()}${extension}`;
    const targetDir = join(process.cwd(), 'uploads', input.folder);

    await mkdir(targetDir, { recursive: true });

    const absolutePath = join(targetDir, fileName);
    await writeFile(absolutePath, input.buffer);

    return {
      provider: 'local',
      url: isSensitiveFolder(input.folder)
        ? ''
        : `/uploads/${input.folder}/${fileName}`,
      fileUrl: isSensitiveFolder(input.folder)
        ? ''
        : `/uploads/${input.folder}/${fileName}`,
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
    const safeBase = (input.targetBaseName || input.originalName.replace(extension, ''))
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
    const fileName = `${safeBase || randomUUID()}${extension}`;
    const pathname = `${input.folder}/${fileName}`;

    const blob = await put(pathname, input.buffer, {
      access: 'public',
      addRandomSuffix: false,
      contentType: input.mimeType,
      token: this.blobToken,
    });

    return {
      provider: 'vercel-blob',
      url: isSensitiveFolder(input.folder) ? '' : blob.url,
      fileUrl: isSensitiveFolder(input.folder) ? '' : blob.url,
      key: isSensitiveFolder(input.folder) ? blob.url : blob.pathname,
      resourceType: input.resourceType,
      fileName,
      mimeType: input.mimeType,
      size: input.buffer.length,
    };
  }

  private async deleteFromVercelBlob(pathname: string) {
    try {
      await del(pathname, { token: this.blobToken });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.warn(
        `No se pudo eliminar blob remoto ${pathname}: ${message}`,
      );
    }
  }

  private resolveLocalReadPath(location: string) {
    const normalizedLocation = location.replace(/\\/g, '/');
    const uploadsRoot = resolve(process.cwd(), 'uploads');
    const localLocation = normalizedLocation.startsWith('/uploads/')
      ? join(process.cwd(), normalizedLocation.replace(/^\//, ''))
      : location;

    const resolvedLocation = resolve(localLocation);
    const isInsideUploads =
      resolvedLocation === uploadsRoot ||
      resolvedLocation.startsWith(`${uploadsRoot}${sep}`);

    if (!isInsideUploads) {
      throw new InternalServerErrorException(
        'Archivo fuera del almacenamiento permitido',
      );
    }

    return resolvedLocation;
  }

  private assertAllowedRemoteUrl(location: string) {
    const parsed = new URL(location);

    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('URL remota de archivo no permitida');
    }

    if (this.isPrivateOrLocalHost(parsed.hostname)) {
      throw new BadRequestException('Host privado de archivo no permitido');
    }

    const allowedHosts = this.getAllowedRemoteHosts();
    const hostname = parsed.hostname.toLowerCase();
    const allowed = [...allowedHosts].some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    );

    if (!allowed) {
      throw new BadRequestException('Host remoto de archivo no permitido');
    }
  }

  private getAllowedRemoteHosts() {
    const hosts = new Set<string>();
    const configuredHost =
      this.configService.get<string>('STORAGE_ALLOWED_REMOTE_HOST') ||
      process.env.STORAGE_ALLOWED_REMOTE_HOST ||
      '';

    configuredHost
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean)
      .forEach((host) => hosts.add(host));

    if (this.provider === 'vercel-blob') {
      hosts.add('blob.vercel-storage.com');
      hosts.add('public.blob.vercel-storage.com');
      hosts.add('vercel-storage.com');
    }

    return hosts;
  }

  private isPrivateOrLocalHost(hostname: string) {
    const host = hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) return true;

    const ipv4Match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!ipv4Match) return false;

    const [, aRaw, bRaw] = ipv4Match;
    const first = Number(aRaw);
    const second = Number(bRaw);

    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254) ||
      first === 0
    );
  }
}
