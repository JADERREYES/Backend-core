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

  it('returns the local unavailable response when OPENAI_API_KEY is missing', async () => {
    const service = new AiService(
      createConfigService(),
      { retrieveRelevantContext: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.generateResponse('Hola');

    expect(result).toEqual({
      text: 'El servicio de IA no esta disponible en este entorno en este momento.',
      contextUsed: false,
      retrievalMode: 'none',
      sources: [],
    });
  });

  it('uses OPENAI_CHAT_MODEL from ConfigService', () => {
    const service = new AiService(
      createConfigService({
        OPENAI_API_KEY: 'test-openai-key',
        OPENAI_CHAT_MODEL: 'gpt-4o-mini',
      }),
      { retrieveRelevantContext: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      chatModel: string;
    };

    expect(service.chatModel).toBe('gpt-4o-mini');
  });

  it('avoids document retrieval for general emotional prompts', () => {
    const service = new AiService(
      createConfigService(),
      { retrieveRelevantContext: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      shouldUseDocumentContext: (prompt: string) => boolean;
    };

    expect(service.shouldUseDocumentContext('Me siento triste hoy')).toBe(false);
  });

  it('keeps document retrieval for plan and payment prompts', () => {
    const service = new AiService(
      createConfigService(),
      { retrieveRelevantContext: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      shouldUseDocumentContext: (prompt: string) => boolean;
    };

    expect(
      service.shouldUseDocumentContext(
        'Cuanto cuesta el plan premium y como pago por Nequi',
      ),
    ).toBe(true);
  });

  it('detects suicidal phrasing written as suicidar', () => {
    const service = new AiService(
      createConfigService(),
      { retrieveRelevantContext: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      containsRiskLanguage: (prompt: string) => boolean;
    };

    expect(service.containsRiskLanguage('que pasa si me quiero suicidar')).toBe(
      true,
    );
  });
});
