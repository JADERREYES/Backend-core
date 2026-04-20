import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  const createService = (config: Record<string, string> = {}) =>
    new StorageService({
      get: (key: string) => config[key],
    } as ConfigService);

  it('rejects local reads outside uploads', async () => {
    const service = createService({ STORAGE_PROVIDER: 'local' });

    await expect(service.read('C:/Windows/system.ini')).rejects.toThrow(
      'Archivo fuera del almacenamiento permitido',
    );
  });

  it('rejects arbitrary remote URLs', async () => {
    const service = createService({ STORAGE_PROVIDER: 'vercel-blob' });

    await expect(
      service.read('https://127.0.0.1/internal.pdf'),
    ).rejects.toThrow('Host privado de archivo no permitido');
  });

  it('does not delete local files outside uploads', async () => {
    const service = createService({ STORAGE_PROVIDER: 'local' });

    await expect(service.delete('C:/Windows/system.ini')).rejects.toThrow(
      'Archivo fuera del almacenamiento permitido',
    );
  });
});
