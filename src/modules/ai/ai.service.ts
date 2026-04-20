import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { DocumentsRagService } from '../documents/documents-rag.service';
import { ChatsService } from '../chats/chats.service';
import { MessagesService } from '../messages/messages.service';
import { AlertsService } from '../alerts/alerts.service';

type AiSource = {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  score: number;
  excerpt: string;
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

const CRISIS_KEYWORD_REGEX =
  /\b(suicid(?:a(?:r(?:me|se)?)?|io|arme|arse)?|matarme|quitarme la vida|autoles(?:ion|ionarme)?|lesionarme|hacerme dano|hacerm[eé] da[nñ]o|no quiero vivir|quiero morir)\b/i;

const DOCUMENT_CONTEXT_KEYWORD_REGEX =
  /\b(plan|premium|free|trial|suscrip(?:cion|cione?s)?|pago|nequi|comprobante|recibo|factura|precio|valor|cobro|chat(?:s)?|mensaje(?:s)?|limite(?:s)?|documento(?:s)?|archivo(?:s)?|pdf|subir|perfil|privacidad|seguridad|historial|correo|email|whatsapp|admin|superadmin|aprobar|rechazar|activar|activacion|venc(?:e|imiento)|dias?)\b/i;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openai?: OpenAI;
  private readonly chatModel: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly documentsRagService: DocumentsRagService,
    private readonly chatsService: ChatsService,
    private readonly messagesService: MessagesService,
    private readonly alertsService: AlertsService,
  ) {
    const openAiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (openAiApiKey) {
      this.openai = new OpenAI({
        apiKey: openAiApiKey,
        timeout: 20000,
      });
    }
    this.chatModel =
      this.configService.get<string>('OPENAI_CHAT_MODEL') || 'gpt-3.5-turbo';
  }

  async generateResponse(
    prompt: string,
    options?: {
      history?: ConversationHistoryItem[];
    },
  ): Promise<AiResponse> {
    if (!prompt) {
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
      const rag = this.shouldUseDocumentContext(prompt)
        ? await this.documentsRagService.retrieveRelevantContext(prompt, 3)
        : {
            chunks: [],
            contextUsed: false,
            retrievalMode: 'none',
          };
      const contextBlock = rag.chunks
        .map(
          (chunk, index) =>
            `[Fuente ${index + 1} | ${chunk.documentTitle} | chunk ${chunk.chunkIndex}]\n${chunk.text}`,
        )
        .join('\n\n');

      const systemMessage = rag.contextUsed
        ? `Eres un asistente de apoyo emocional amable y empatico. Mantienes continuidad con el historial reciente y respondes de forma coherente con lo ya hablado.\n\nSi la pregunta toca informacion interna o factual, usa solo el contexto documental recuperado. No inventes politicas, procesos, nombres, cifras, diagnosticos ni instrucciones que no aparezcan ahi. Si el contexto no alcanza para responder con certeza, dilo con claridad y pide al usuario que comparta mas detalle o que un administrador cargue/publice mejor la documentacion.\n\nCuando el usuario pida apoyo emocional general, responde con cercania, claridad y pasos concretos breves. Cuando uses informacion documental, integrala de forma natural y menciona la fuente por su titulo si ayuda.\n\nContexto documental:\n${contextBlock}`
        : 'Eres un asistente de apoyo emocional amable y empatico. Mantienes continuidad con el historial reciente y no inventas datos factuales o internos. Si el usuario pide informacion especifica que dependa de documentacion interna y no tienes contexto suficiente, dilo claramente.';

      const messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
      }> = [{ role: 'system', content: systemMessage }];

      history.slice(-10).forEach((item) => {
        messages.push({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          content: item.content,
        });
      });

      messages.push({ role: 'user', content: prompt });

      const completion = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages,
        max_tokens: 180,
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
          score: Number(chunk.score.toFixed(4)),
          excerpt:
            chunk.text.length > 280
              ? `${chunk.text.slice(0, 280)}...`
              : chunk.text,
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
      ? await this.messagesService.findRecentByChatId(finalChatId, 10)
      : [];
    const userMessage = await this.messagesService.create({
      chatId: finalChatId,
      senderId: userId,
      role: 'user',
      content: cleanMessage,
    });
    const aiResult = await this.generateResponse(cleanMessage, {
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
    });

    await this.chatsService.incrementMessageCount(finalChatId);
    await this.chatsService.incrementMessageCount(finalChatId);

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

  private shouldUseDocumentContext(prompt: string) {
    const normalizedPrompt = prompt.trim().toLowerCase();

    if (!normalizedPrompt) {
      return false;
    }

    return DOCUMENT_CONTEXT_KEYWORD_REGEX.test(normalizedPrompt);
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
