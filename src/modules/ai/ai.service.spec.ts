import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';

const createConfigService = (config: Record<string, string> = {}) =>
  ({
    get: (key: string) => config[key],
  }) as ConfigService;

describe('AiService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createService = (config: Record<string, string> = {}) =>
    new AiService(
      createConfigService(config),
      { retrieveRelevantContext: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      { findByUserId: jest.fn() } as never,
      {
        listActiveByUser: jest.fn().mockResolvedValue([]),
        isEnabled: jest.fn().mockReturnValue(true),
      } as never,
    );

  it('returns the local unavailable response when OPENAI_API_KEY is missing', async () => {
    const service = createService();

    const result = await service.generateResponse('Hola');

    expect(result).toEqual({
      text: 'El servicio de IA no esta disponible en este entorno en este momento.',
      contextUsed: false,
      retrievalMode: 'none',
      sources: [],
    });
  });

  it('uses OPENAI_CHAT_MODEL from ConfigService', () => {
    const service = createService({
      OPENAI_API_KEY: 'test-openai-key',
      OPENAI_CHAT_MODEL: 'gpt-4o-mini',
    }) as unknown as {
      chatModel: string;
    };

    expect(service.chatModel).toBe('gpt-4o-mini');
  });

  it('uses at least 10 messages as short term memory floor', () => {
    const service = createService({
      AI_SHORT_TERM_MEMORY_LIMIT: '3',
    }) as unknown as {
      shortTermLimit: number;
    };

    expect(service.shortTermLimit).toBe(10);
  });

  it('detects suicidal phrasing written as suicidar', () => {
    const service = createService() as unknown as {
      containsRiskLanguage: (prompt: string) => boolean;
    };

    expect(service.containsRiskLanguage('que pasa si me quiero suicidar')).toBe(
      true,
    );
  });

  it('does not flag a regular support prompt as crisis language', () => {
    const service = createService() as unknown as {
      containsRiskLanguage: (prompt: string) => boolean;
    };

    expect(
      service.containsRiskLanguage('hoy quiero aprender a respirar mejor'),
    ).toBe(false);
  });
});
