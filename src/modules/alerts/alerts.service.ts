import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Alert } from './schemas/alert.schema';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { MessagesService } from '../messages/messages.service';
import { ChatsService } from '../chats/chats.service';

const DEFAULT_CRISIS_SUPPORT_MESSAGE = `Este es un mensaje prioritario de apoyo. Si sientes que podrias hacerte dano o que tu vida corre peligro ahora, llama de inmediato al 123 en Colombia. Si estas en Bogota y necesitas orientacion emocional, tambien puedes comunicarte con la Linea 106. Busca a una persona de confianza, evita quedarte solo o sola y acude a un servicio de urgencias o a tu red cercana ahora mismo.`;

@Injectable()
export class AlertsService {
  constructor(
    @InjectModel(Alert.name) private alertModel: Model<Alert>,
    private readonly messagesService: MessagesService,
    private readonly chatsService: ChatsService,
  ) {}

  async create(payload: {
    type?: 'security' | 'system' | 'user' | 'subscription';
    severity?: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description?: string;
    status?: 'open' | 'investigating' | 'resolved';
    assignedTo?: string;
    relatedUserId?: string;
    relatedChatId?: string;
  }) {
    return this.alertModel.create({
      type: payload.type || 'user',
      severity: payload.severity || 'high',
      title: payload.title,
      description: payload.description || '',
      status: payload.status || 'open',
      assignedTo: payload.assignedTo,
      relatedUserId: payload.relatedUserId,
      relatedChatId: payload.relatedChatId,
    });
  }

  async findAll() {
    return this.alertModel.find().sort({ createdAt: -1 }).lean().exec();
  }

  async updateStatus(
    id: string,
    status: 'open' | 'investigating' | 'resolved',
  ) {
    return this.update(id, { status });
  }

  async update(id: string, payload: UpdateAlertDto) {
    const alert = await this.alertModel
      .findByIdAndUpdate(id, { $set: payload }, { new: true })
      .lean()
      .exec();

    if (!alert) {
      throw new NotFoundException('Alerta no encontrada');
    }

    return alert;
  }

  async sendCrisisSupportMessage(
    id: string,
    adminUserId: string,
    message?: string,
  ) {
    const alert = await this.alertModel.findById(id).lean().exec();

    if (!alert) {
      throw new NotFoundException('Alerta no encontrada');
    }

    const relatedUserId =
      alert.relatedUserId || this.extractReference(alert.description, 'Usuario');
    const relatedChatId =
      alert.relatedChatId || this.extractReference(alert.description, 'Chat');

    if (!relatedUserId || !relatedChatId) {
      throw new BadRequestException(
        'La alerta no tiene referencias suficientes para enviar apoyo al chat.',
      );
    }

    const supportMessage = message?.trim() || DEFAULT_CRISIS_SUPPORT_MESSAGE;

    await this.chatsService.findOne(relatedChatId, relatedUserId);

    const sentMessage = await this.messagesService.create({
      chatId: relatedChatId,
      senderId: relatedUserId,
      role: 'assistant',
      content: supportMessage,
      metadata: {
        urgentSupport: true,
        adminNotification: true,
        unreadForUser: true,
        sentByAdminId: adminUserId,
        alertId: id,
      },
    });

    await this.chatsService.incrementMessageCount(relatedChatId);

    const updatedAlert = await this.alertModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: alert.status === 'resolved' ? 'resolved' : 'investigating',
            assignedTo: alert.assignedTo || adminUserId,
            responseSentAt: new Date(),
            responseMessageId: String(sentMessage.id),
            relatedUserId,
            relatedChatId,
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    return {
      alert: updatedAlert,
      message: sentMessage,
    };
  }

  private extractReference(description: string, label: 'Usuario' | 'Chat') {
    const match = description.match(
      new RegExp(`${label}:\\s*([a-fA-F0-9]{24})`, 'i'),
    );

    return match?.[1] || '';
  }
}
