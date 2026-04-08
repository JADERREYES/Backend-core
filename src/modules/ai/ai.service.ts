import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { DocumentsRagService } from '../documents/documents-rag.service';
import { ChatsService } from '../chats/chats.service';
import { MessagesService } from '../messages/messages.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openai?: OpenAI;
  private readonly chatModel: string;

  constructor(
    private readonly documentsRagService: DocumentsRagService,
    private readonly chatsService: ChatsService,
    private readonly messagesService: MessagesService,
  ) {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 20000,
      });
    }
    this.chatModel = process.env.OPENAI_CHAT_MODEL || 'gpt-3.5-turbo';
  }

  async generateResponse(prompt: string) {
    if (!prompt) {
      return {
        text: 'Por favor, escribe un mensaje.',
        contextUsed: false,
        retrievalMode: 'none',
        sources: [],
      };
    }

    if (!this.openai) {
      this.logger.warn('OPENAI_API_KEY no configurada. Se devuelve respuesta local.');
      return {
        text: 'El servicio de IA no esta disponible en este entorno en este momento.',
        contextUsed: false,
        retrievalMode: 'none',
        sources: [],
      };
    }

    try {
      const rag = await this.documentsRagService.retrieveRelevantContext(prompt, 4);
      const contextBlock = rag.chunks
        .map(
          (chunk, index) =>
            `[Fuente ${index + 1} | ${chunk.documentTitle} | chunk ${chunk.chunkIndex}]\n${chunk.text}`,
        )
        .join('\n\n');

      const systemMessage = rag.contextUsed
        ? `Eres un asistente de apoyo emocional amable y empatico. Tambien puedes usar contexto documental interno cuando sea relevante. Si usas el contexto, prioriza la informacion documental y no inventes detalles fuera de ese contexto.\n\nContexto documental:\n${contextBlock}`
        : 'Eres un asistente de apoyo emocional amable y empatico.';

      const completion = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt },
        ],
        max_tokens: 250,
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
    } catch (error: any) {
      this.logger.error(`Error en IA: ${error?.message}`, error?.stack);
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
    let chatRecord: any = null;

    if (finalChatId) {
      chatRecord = await this.chatsService.findOne(finalChatId, userId);
    } else {
      chatRecord = await this.chatsService.create(userId, {
        title: title?.trim() || cleanMessage.slice(0, 48),
      });
      finalChatId = String(chatRecord._id);
    }

    const userMessage = await this.messagesService.create({
      chatId: finalChatId!,
      senderId: userId,
      role: 'user',
      content: cleanMessage,
    });

    const aiResult = await this.generateResponse(cleanMessage);
    const assistantMessage = await this.messagesService.create({
      chatId: finalChatId!,
      senderId: userId,
      role: 'assistant',
      content: aiResult.text,
    });

    await this.chatsService.incrementMessageCount(finalChatId!);
    await this.chatsService.incrementMessageCount(finalChatId!);

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

  private serializeChat(chat: any) {
    const source = typeof chat?.toObject === 'function' ? chat.toObject() : { ...chat };
    return {
      ...source,
      _id: source?._id?.toString?.() ?? source?._id,
    };
  }

  private serializeMessage(message: any, fallbackRole: 'user' | 'assistant' | 'system') {
    const source =
      typeof message?.toObject === 'function' ? message.toObject() : { ...message };

    return {
      ...source,
      _id: source?._id?.toString?.() ?? source?._id,
      chatId: source?.chatId?.toString?.() ?? source?.chatId,
      senderId: source?.senderId?.toString?.() ?? source?.senderId,
      role: source?.role ?? source?.type ?? fallbackRole,
    };
  }
}
