import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { DocumentsRagService } from '../documents/documents-rag.service';
import { ChatsService } from '../chats/chats.service';
import { MessagesService } from '../messages/messages.service';
import { AlertsService } from '../alerts/alerts.service';
import { ProfilesService } from '../profiles/profiles.service';
import { UserMemoriesService } from './user-memories.service';

type AiSource = {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  totalChunks: number;
  score: number;
  excerpt: string;
  sourceFileName?: string;
  sourceType?: string;
};

type AiResponse = {
  text: string;
  contextUsed: boolean;
  retrievalMode: string;
  sources: AiSource[];
};

type ConversationHistoryItem = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type SerializableEntity = Record<string, unknown> & {
  toObject?: () => Record<string, unknown>;
};

type ObjectIdLike = {
  toHexString: () => string;
};

type MemorySuggestion = {
  shouldStore?: boolean;
  type?: 'preference' | 'goal' | 'coping_strategy' | 'support_context' | 'summary';
  summary?: string;
  confidence?: number;
};

const CRISIS_KEYWORD_REGEX =
  /\b(suicid(?:a(?:r(?:me|se)?)?|io|arme|arse)?|matarme|quitarme la vida|autoles(?:ion|ionarme)?|lesionarme|hacerme dano|hacerm[eé] da[nñ]o|no quiero vivir|quiero morir)\b/i;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openai?: OpenAI;
  private readonly chatModel: string;
  private readonly shortTermLimit: number;
  private readonly ragTopK: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly documentsRagService: DocumentsRagService,
    private readonly chatsService: ChatsService,
    private readonly messagesService: MessagesService,
    private readonly alertsService: AlertsService,
    private readonly profilesService: ProfilesService,
    private readonly userMemoriesService: UserMemoriesService,
  ) {
    const openAiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (openAiApiKey) {
      this.openai = new OpenAI({
        apiKey: openAiApiKey,
        timeout: 25000,
      });
    }

    this.chatModel =
      this.configService.get<string>('OPENAI_CHAT_MODEL') || 'gpt-4o-mini';
    this.shortTermLimit = Math.min(
      Math.max(
        Number(this.configService.get<string>('AI_SHORT_TERM_MEMORY_LIMIT') || 14),
        10,
      ),
      20,
    );
    this.ragTopK = Math.min(
      Math.max(Number(this.configService.get<string>('RAG_TOP_K') || 5), 1),
      8,
    );
  }

  async generateResponse(
    prompt: string,
    options?: {
      history?: ConversationHistoryItem[];
      userId?: string;
    },
  ): Promise<AiResponse> {
    if (!prompt?.trim()) {
      return {
        text: 'Por favor, escribe un mensaje.',
        contextUsed: false,
        retrievalMode: 'none',
        sources: [],
      };
    }

    if (!this.openai) {
      this.logger.warn(
        'OPENAI_API_KEY no configurada. Se devuelve respuesta local.',
      );
      return {
        text: 'El servicio de IA no esta disponible en este entorno en este momento.',
        contextUsed: false,
        retrievalMode: 'none',
        sources: [],
      };
    }

    try {
      const history = (options?.history || []).filter(
        (item) => item?.content?.trim() && item.role !== 'system',
      );
      const [rag, longTermContext] = await Promise.all([
        this.documentsRagService.retrieveRelevantContext(prompt, this.ragTopK, {
          ownerTypes: options?.userId ? ['admin', 'user'] : ['admin'],
          userId: options?.userId,
          includeGlobalAdmin: true,
        }),
        this.buildLongTermContext(options?.userId),
      ]);

      const recentHistory = history.slice(-this.shortTermLimit);
      const crisisMode = this.containsRiskLanguage(prompt);
      const systemMessage = this.buildSystemPrompt({
        rag,
        longTermContext,
        crisisMode,
      });

      const messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
      }> = [{ role: 'system', content: systemMessage }];

      recentHistory.forEach((item) => {
        messages.push({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          content: item.content,
        });
      });

      messages.push({ role: 'user', content: prompt.trim() });

      const completion = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages,
        max_tokens: crisisMode ? 260 : 220,
        temperature: 0.6,
      });

      return {
        text:
          completion.choices[0].message.content ||
          'No pude generar una respuesta.',
        contextUsed: rag.contextUsed,
        retrievalMode: rag.retrievalMode,
        sources: rag.chunks.map((chunk) => ({
          documentId: chunk.documentId,
          documentTitle: chunk.documentTitle,
          chunkIndex: chunk.chunkIndex,
          totalChunks: chunk.totalChunks,
          score: Number(chunk.score.toFixed(4)),
          excerpt:
            chunk.text.length > 280
              ? `${chunk.text.slice(0, 280)}...`
              : chunk.text,
          sourceFileName: chunk.sourceFileName,
          sourceType: chunk.sourceType,
        })),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error en IA: ${message}`, stack);
      return {
        text: 'Lo siento, tuve un problema. Puedes intentarlo de nuevo.',
        contextUsed: false,
        retrievalMode: 'none',
        sources: [],
      };
    }
  }

  async generateConversationResponse(
    userId: string,
    message: string,
    chatId?: string,
    title?: string,
  ) {
    const cleanMessage = message?.trim();
    if (!cleanMessage) {
      return {
        response: 'Por favor, escribe un mensaje.',
        contextUsed: false,
        retrievalMode: 'none',
        sources: [],
        chatId: chatId ?? null,
      };
    }

    let finalChatId = chatId;
    let chatRecord: unknown = null;

    if (finalChatId) {
      chatRecord = await this.chatsService.findOne(finalChatId, userId);
    } else {
      chatRecord = await this.chatsService.create(userId, {
        title: title?.trim() || cleanMessage.slice(0, 48),
      });
      finalChatId = this.stringifyValue(
        this.toPlainRecord(chatRecord)._id,
      ) as string;
    }

    await this.raisePrivacySafeRiskAlert(userId, finalChatId, cleanMessage);

    const recentHistory = finalChatId
      ? await this.messagesService.findRecentByChatId(
          finalChatId,
          this.shortTermLimit,
        )
      : [];

    const userMessage = await this.messagesService.create({
      chatId: finalChatId,
      senderId: userId,
      role: 'user',
      content: cleanMessage,
    });

    const aiResult = await this.generateResponse(cleanMessage, {
      userId,
      history: recentHistory
        .filter((item) => item.content?.trim())
        .map((item) => ({
          role:
            item.role === 'assistant' || item.role === 'system'
              ? item.role
              : 'user',
          content: item.content,
        })),
    });

    const assistantMessage = await this.messagesService.create({
      chatId: finalChatId,
      senderId: userId,
      role: 'assistant',
      content: aiResult.text,
      metadata: {
        contextUsed: aiResult.contextUsed,
        retrievalMode: aiResult.retrievalMode,
        sources: aiResult.sources.map((source) => ({
          documentId: source.documentId,
          documentTitle: source.documentTitle,
          chunkIndex: source.chunkIndex,
          score: source.score,
        })),
      },
    });

    await this.chatsService.incrementMessageCount(finalChatId);
    await this.chatsService.incrementMessageCount(finalChatId);

    void this.refreshLongTermMemory(userId, cleanMessage, aiResult.text);

    return {
      chat: this.serializeChat(chatRecord),
      chatId: finalChatId,
      userMessage: this.serializeMessage(userMessage, 'user'),
      assistantMessage: this.serializeMessage(assistantMessage, 'assistant'),
      response: aiResult.text,
      contextUsed: aiResult.contextUsed,
      retrievalMode: aiResult.retrievalMode,
      sources: aiResult.sources,
    };
  }

  private buildSystemPrompt({
    rag,
    longTermContext,
    crisisMode,
  }: {
    rag: Awaited<ReturnType<DocumentsRagService['retrieveRelevantContext']>>;
    longTermContext: string;
    crisisMode: boolean;
  }) {
    const documentContext = rag.chunks.length
      ? rag.chunks
          .map(
            (chunk, index) =>
              `[Fuente ${index + 1} | ${chunk.documentTitle} | archivo: ${chunk.sourceFileName || 'sin-archivo'} | chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks}]\n${chunk.text}`,
          )
          .join('\n\n')
      : 'Sin documentos relevantes recuperados.';

    const crisisInstructions = crisisMode
      ? `El ultimo mensaje sugiere posible crisis o riesgo de autolesion. Responde con tono calmado, directo y humano. Prioriza seguridad inmediata, invita a contactar una persona de confianza o servicios de emergencia/locales, y deja claro que no sustituyes ayuda profesional. No uses tono frio ni burocratico.`
      : '';

    return [
      'Eres MenteAmiga, un asistente de apoyo emocional para salud emocional.',
      'Responde con empatia, honestidad y utilidad practica.',
      'Nunca inventes hechos, politicas, diagnosticos, nombres, resultados ni contenido documental.',
      'Si no hay contexto suficiente para responder una parte, dilo claramente.',
      'No sustituyes atencion medica, psiquiatrica ni psicologica profesional.',
      'Si usas informacion documental, menciona la fuente por titulo o archivo de forma natural.',
      'No conviertas memoria corta o larga en verdad absoluta: usala como contexto orientativo.',
      crisisInstructions,
      longTermContext ? `Memoria larga util y segura:\n${longTermContext}` : '',
      `Contexto documental RAG:\n${documentContext}`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private async buildLongTermContext(userId?: string) {
    if (!userId) {
      return '';
    }

    try {
      const [profile, memories] = await Promise.all([
        this.profilesService.findByUserId(userId),
        this.userMemoriesService.listActiveByUser(userId, 5),
      ]);

      const fragments: string[] = [];

      if (profile) {
        if (profile.displayName) {
          fragments.push(`Nombre preferido: ${profile.displayName}.`);
        }
        if (profile.bio) {
          fragments.push(`Bio breve: ${String(profile.bio).trim()}.`);
        }
        const goals = Array.isArray(profile.onboardingData?.goals)
          ? profile.onboardingData.goals.filter(Boolean).slice(0, 3)
          : [];
        if (goals.length) {
          fragments.push(`Objetivos declarados: ${goals.join(', ')}.`);
        }
        const recentCheckIn = Array.isArray(profile.checkIns)
          ? profile.checkIns[profile.checkIns.length - 1]
          : null;
        if (recentCheckIn?.mood) {
          fragments.push(
            `Ultimo check-in conocido: estado ${recentCheckIn.mood}${recentCheckIn.energy ? `, energia ${recentCheckIn.energy}` : ''}.`,
          );
        }
      }

      memories.forEach((memory) => {
        if (memory?.summary) {
          fragments.push(`Memoria ${memory.type}: ${memory.summary}`);
        }
      });

      return fragments.join('\n');
    } catch (error: unknown) {
      this.logger.warn(
        `No se pudo construir memoria larga del usuario: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return '';
    }
  }

  private async refreshLongTermMemory(
    userId: string,
    userMessage: string,
    assistantMessage: string,
  ) {
    if (!this.openai || !this.userMemoriesService.isEnabled()) {
      return;
    }

    if (this.containsRiskLanguage(userMessage) || userMessage.length < 30) {
      return;
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.chatModel,
        temperature: 0,
        max_tokens: 140,
        messages: [
          {
            role: 'system',
            content:
              'Analiza el ultimo intercambio y decide si conviene guardar una memoria larga segura. Guarda solo preferencias, metas, estrategias de afrontamiento o contexto de apoyo estables. No guardes datos clinicos sensibles, crisis, ideacion suicida, detalles sexuales, financieros o identificadores innecesarios. Responde SOLO JSON con claves shouldStore, type, summary, confidence.',
          },
          {
            role: 'user',
            content: `Mensaje usuario: ${userMessage}\nRespuesta asistente: ${assistantMessage}`,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content || '';
      const parsed = this.parseMemorySuggestion(raw);
      if (!parsed.shouldStore || !parsed.summary || !parsed.type) {
        return;
      }

      await this.userMemoriesService.createOrRefresh(userId, {
        type: parsed.type,
        summary: parsed.summary,
        source: 'chat',
        confidence: Number(parsed.confidence ?? 0.6),
      });
    } catch (error: unknown) {
      this.logger.warn(
        `No se pudo actualizar memoria larga: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  private parseMemorySuggestion(raw: string): MemorySuggestion {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as MemorySuggestion;
      const summary = String(parsed.summary || '').trim();
      if (summary.length > 220) {
        parsed.summary = `${summary.slice(0, 217)}...`;
      }
      return parsed;
    } catch {
      return {};
    }
  }

  private serializeChat(chat: unknown) {
    const source = this.toPlainRecord(chat);
    return {
      ...source,
      _id: this.stringifyValue(source._id),
    };
  }

  private serializeMessage(
    message: unknown,
    fallbackRole: 'user' | 'assistant' | 'system',
  ) {
    const source = this.toPlainRecord(message);
    const role =
      typeof source.role === 'string'
        ? source.role
        : typeof source.type === 'string'
          ? source.type
          : fallbackRole;

    return {
      ...source,
      _id: this.stringifyValue(source._id),
      chatId: this.stringifyValue(source.chatId),
      senderId: this.stringifyValue(source.senderId),
      role,
    };
  }

  private toPlainRecord(value: unknown): Record<string, unknown> {
    if (!this.isSerializableEntity(value)) {
      return {};
    }

    if (typeof value.toObject === 'function') {
      return value.toObject();
    }

    return { ...value };
  }

  private isSerializableEntity(value: unknown): value is SerializableEntity {
    return typeof value === 'object' && value !== null;
  }

  private stringifyValue(value: unknown): unknown {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (this.isObjectIdLike(value)) return value.toHexString();

    return value;
  }

  private isObjectIdLike(value: unknown): value is ObjectIdLike {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { toHexString?: unknown };
    return typeof candidate.toHexString === 'function';
  }

  private async raisePrivacySafeRiskAlert(
    userId: string,
    chatId: string | undefined,
    message: string,
  ) {
    if (!chatId || !this.containsRiskLanguage(message)) {
      return;
    }

    try {
      await this.alertsService.create({
        type: 'user',
        severity: 'critical',
        title: 'Posible riesgo de autolesion o suicidio',
        description: `Se detecto lenguaje de riesgo en una conversacion privada. Usuario: ${userId}. Chat: ${chatId}. No se expone el contenido por privacidad.`,
        status: 'open',
        relatedUserId: userId,
        relatedChatId: chatId,
      });
    } catch (error: unknown) {
      const messageText =
        error instanceof Error ? error.message : 'Unknown alert error';
      this.logger.warn(`No se pudo registrar alerta de riesgo: ${messageText}`);
    }
  }

  private containsRiskLanguage(message: string) {
    return CRISIS_KEYWORD_REGEX.test(message);
  }
}
