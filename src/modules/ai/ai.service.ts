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

type EmotionalIntent =
  | 'anxiety'
  | 'sadness'
  | 'exhaustion'
  | 'loneliness'
  | 'emotional_violence'
  | 'self_esteem'
  | 'academic_stress'
  | 'crisis'
  | 'general';

const CRISIS_KEYWORD_REGEX =
  /\b(suicid(?:a(?:r(?:me|se)?)?|io|arme|arse)?|matarme|quitarme la vida|autoles(?:ion|ionarme)?|lesionarme|hacerme dano|hacerm[eé] da[nñ]o|no quiero vivir|quiero morir)\b/i;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openai?: OpenAI;
  private readonly chatModel: string;
  private readonly shortTermLimit: number;
  private readonly ragTopK: number;
  private readonly chatTimeoutMs: number;

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
      this.chatTimeoutMs = Math.max(
        Number(this.configService.get<string>('OPENAI_TIMEOUT_MS') || 40000),
        25000,
      );
      this.openai = new OpenAI({
        apiKey: openAiApiKey,
        timeout: this.chatTimeoutMs,
      });
    } else {
      this.chatTimeoutMs = 40000;
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
      const intent = this.detectEmotionalIntent(prompt);
      const shouldLeadWithQuestion = this.shouldLeadWithQuestion(
        prompt,
        recentHistory,
        crisisMode,
      );
      const systemMessage = this.buildSystemPrompt({
        rag,
        longTermContext,
        crisisMode,
        intent,
        shouldLeadWithQuestion,
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
        max_tokens: crisisMode ? 300 : 220,
        temperature: crisisMode ? 0.5 : 0.45,
      });

      let responseText =
        completion.choices[0].message.content ||
        'No pude generar una respuesta.';

      if (crisisMode && completion.choices[0].finish_reason === 'length') {
        const continuation = await this.openai.chat.completions.create({
          model: this.chatModel,
          temperature: 0.35,
          max_tokens: 120,
          messages: [
            ...messages,
            { role: 'assistant', content: responseText },
            {
              role: 'user',
              content:
                'Cierra la idea con un ultimo parrafo breve, humano y concreto, sin repetir ni abrir nuevos temas.',
            },
          ],
        });
        const continuationText =
          continuation.choices[0].message.content?.trim() || '';
        if (continuationText) {
          responseText = `${responseText.trimEnd()}\n\n${continuationText}`;
        }
      }

      this.logger.debug(
        `AI response generated promptLength=${prompt.trim().length} responseLength=${responseText.length} historyItems=${recentHistory.length} retrievalMode=${rag.retrievalMode} sources=${rag.chunks.length} timeoutMs=${this.chatTimeoutMs}`,
      );

      return {
        text: responseText,
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
        contentLength: aiResult.text.length,
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

    this.logger.debug(
      `AI conversation stored userId=${userId} chatId=${finalChatId} userLength=${cleanMessage.length} assistantLength=${aiResult.text.length} savedContextUsed=${aiResult.contextUsed} retrievalMode=${aiResult.retrievalMode}`,
    );

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
    intent,
    shouldLeadWithQuestion,
  }: {
    rag: Awaited<ReturnType<DocumentsRagService['retrieveRelevantContext']>>;
    longTermContext: string;
    crisisMode: boolean;
    intent: EmotionalIntent;
    shouldLeadWithQuestion: boolean;
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
      ? `El ultimo mensaje sugiere posible crisis o riesgo de autolesion. Responde con tono calmado, directo y humano. Prioriza seguridad inmediata, invita a contactar una persona de confianza o servicios de emergencia/locales, y deja claro que no sustituyes ayuda profesional. No uses tono frio, tecnico ni burocratico.`
      : '';

    const interactionModeInstructions = shouldLeadWithQuestion
      ? 'En este turno, valida la emocion, acompana con calidez y haz UNA sola pregunta abierta para entender mejor. No des varias soluciones todavia.'
      : 'En este turno ya hay suficiente contexto. Puedes ofrecer apoyo breve y una sola micro-sugerencia suave, seguida de una sola pregunta corta si ayuda a continuar la conversacion.';

    return [
      'Eres MenteAmiga, un asistente de apoyo emocional conversacional.',
      'Tu estilo debe sentirse como una conversacion humana por chat, no como un manual, articulo, informe ni terapia formal.',
      'Responde en espanol con tono calido, cercano, sincero, suave y protector.',
      'Prioriza acompanar antes que aconsejar. Primero valida, luego pregunta, y solo despues sugiere algo pequeno.',
      'Tus respuestas normalmente deben medir entre 40 y 120 palabras. En crisis puedes llegar hasta 180, pero sigue siendo breve.',
      'Escribe parrafos cortos, con aire visual, faciles de leer en movil.',
      'Haz UNA sola pregunta por mensaje cuando necesites mas contexto.',
      'Evita enumeraciones, bullets y listas. Solo usalas si el usuario las pide de forma explicita, y aun asi limita a maximo 3 puntos.',
      'No des charlas largas, no sueltes muchos consejos juntos, no respondas como PDF y no suenes academico, clinico, tecnico ni robotico.',
      'No diagnostiques. No prometas curas ni resultados. No minimices con frases como "todo estara bien" o "no te preocupes".',
      'Nunca inventes hechos, politicas, diagnosticos, nombres, resultados ni contenido documental.',
      'Si no hay contexto suficiente para responder una parte, dilo claramente.',
      'No sustituyes atencion medica, psiquiatrica ni psicologica profesional.',
      'Usa el RAG solo como orientacion silenciosa para entender mejor el caso y responder con mas criterio. No copies, no recites ni cites manuales salvo que el usuario lo pida o sea realmente necesario.',
      'No conviertas memoria corta o larga en verdad absoluta: usala como contexto orientativo.',
      `Intencion emocional detectada: ${intent}.`,
      interactionModeInstructions,
      crisisInstructions,
      longTermContext ? `Memoria larga util y segura:\n${longTermContext}` : '',
      `Contexto documental RAG para orientar el tono y detectar senales, no para sonar documental:\n${documentContext}`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private detectEmotionalIntent(message: string): EmotionalIntent {
    const text = message.toLowerCase();

    if (this.containsRiskLanguage(message)) return 'crisis';
    if (
      /\b(ansiedad|ansioso|ansiosa|nervios|panico|miedo|inquiet[oa]|angustia)\b/i.test(
        text,
      )
    ) {
      return 'anxiety';
    }
    if (
      /\b(triste|tristeza|llorar|vacio|vac[íi]o|desanimad[oa]|decaid[oa])\b/i.test(
        text,
      )
    ) {
      return 'sadness';
    }
    if (
      /\b(agotad[oa]|cansad[oa]|quemad[oa]|burnout|sin energia|sin ganas)\b/i.test(
        text,
      )
    ) {
      return 'exhaustion';
    }
    if (/\b(sol[oa]|solo|sola|aislad[oa]|nadie me escucha|sin nadie)\b/i.test(text)) {
      return 'loneliness';
    }
    if (
      /\b(controla|manipula|gaslighting|humilla|insulta|cela|me revisa|me a[íi]sla|violencia)\b/i.test(
        text,
      )
    ) {
      return 'emotional_violence';
    }
    if (
      /\b(no sirvo|insuficiente|inutil|no valgo|autoestima|me odio|me comparo)\b/i.test(
        text,
      )
    ) {
      return 'self_esteem';
    }
    if (
      /\b(universidad|examen|tarea|clase|semestre|academi|estudi|profesor)\b/i.test(
        text,
      )
    ) {
      return 'academic_stress';
    }

    return 'general';
  }

  private shouldLeadWithQuestion(
    prompt: string,
    history: ConversationHistoryItem[],
    crisisMode: boolean,
  ) {
    if (crisisMode) {
      return false;
    }

    const cleanPrompt = prompt.trim();
    const hasLongerContext = cleanPrompt.length >= 160;
    const hasRecentConversation = history.length >= 4;
    const asksForConcretePlan =
      /\b(que puedo hacer|que hago|dame pasos|hazme un plan|como salgo|ayudame paso a paso)\b/i.test(
        cleanPrompt,
      );

    if (!hasLongerContext && !hasRecentConversation) {
      return true;
    }

    if (!hasRecentConversation && !asksForConcretePlan) {
      return true;
    }

    return false;
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
