import { ConfigService } from '@nestjs/config';
import { DocumentsProcessingService } from './documents-processing.service';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    close: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
}));

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    quit: jest.fn(),
  })),
);

const createConfigService = (config: Record<string, string> = {}) =>
  ({
    get: (key: string) => config[key],
  }) as ConfigService;

describe('DocumentsProcessingService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not initialize BullMQ when REDIS_URL is missing', () => {
    const service = new DocumentsProcessingService(
      createConfigService(),
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      queue?: unknown;
      worker?: unknown;
    };

    expect(service.queue).toBeUndefined();
    expect(service.worker).toBeUndefined();
  });

  it('initializes BullMQ when REDIS_URL is configured', () => {
    const service = new DocumentsProcessingService(
      createConfigService({
        REDIS_URL: 'redis://localhost:6379',
      }),
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      queue?: unknown;
      worker?: unknown;
    };

    expect(service.queue).toBeDefined();
    expect(service.worker).toBeDefined();
  });
});
