import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message } from './schemas/message.schema';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { ChatsService } from '../chats/chats.service';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
    private readonly chatsService: ChatsService,
  ) {}

  async create(createMessageDto: CreateMessageDto): Promise<Message> {
    await this.chatsService.findOne(
      createMessageDto.chatId,
      createMessageDto.senderId,
    );

    const newMessage = new this.messageModel({
      ...createMessageDto,
      chatId: new Types.ObjectId(createMessageDto.chatId),
      senderId: new Types.ObjectId(createMessageDto.senderId),
      type: createMessageDto.role,
    });
    return await newMessage.save();
  }

  async findByChatId(chatId: string): Promise<Message[]> {
    const chatIdObj = new Types.ObjectId(chatId);
    return await this.messageModel
      .find({ chatId: chatIdObj })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
  }

  async findRecentByChatId(chatId: string, limit = 12): Promise<Message[]> {
    const chatIdObj = new Types.ObjectId(chatId);
    const safeLimit = Math.min(Math.max(limit, 1), 30);
    const messages = await this.messageModel
      .find({ chatId: chatIdObj })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean()
      .exec();

    return messages.reverse();
  }

  async findOne(messageId: string): Promise<Message | null> {
    const messageIdObj = new Types.ObjectId(messageId);
    return await this.messageModel.findById(messageIdObj).lean().exec();
  }

  async findByChatIdForUser(chatId: string, userId: string): Promise<Message[]> {
    await this.chatsService.findOne(chatId, userId);
    return this.findByChatId(chatId);
  }

  async findUrgentNotificationsForUser(userId: string): Promise<Message[]> {
    const userIdObj = new Types.ObjectId(userId);
    return this.messageModel
      .find({
        senderId: userIdObj,
        'metadata.urgentSupport': true,
        'metadata.unreadForUser': true,
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
      .exec();
  }

  async markUrgentNotificationsAsReadForUser(userId: string, chatId?: string) {
    const userIdObj = new Types.ObjectId(userId);
    const filter: Record<string, unknown> = {
      senderId: userIdObj,
      'metadata.urgentSupport': true,
      'metadata.unreadForUser': true,
    };

    if (chatId) {
      await this.chatsService.findOne(chatId, userId);
      filter.chatId = new Types.ObjectId(chatId);
    }

    const result = await this.messageModel
      .updateMany(filter, {
        $set: {
          'metadata.unreadForUser': false,
          'metadata.readAt': new Date().toISOString(),
        },
      })
      .exec();

    return {
      modifiedCount: result.modifiedCount ?? 0,
    };
  }

  async findOneForUser(messageId: string, userId: string): Promise<Message | null> {
    const message = await this.findOne(messageId);

    if (!message) {
      return null;
    }

    await this.chatsService.findOne(String(message.chatId), userId);
    return message;
  }

  async deleteByChatId(chatId: string): Promise<void> {
    const chatIdObj = new Types.ObjectId(chatId);
    await this.messageModel.deleteMany({ chatId: chatIdObj }).exec();
  }

  async deleteByChatIdForUser(chatId: string, userId: string): Promise<void> {
    await this.chatsService.findOne(chatId, userId);
    await this.deleteByChatId(chatId);
  }

  async update(
    id: string,
    updateMessageDto: UpdateMessageDto,
  ): Promise<Message | null> {
    const messageIdObj = new Types.ObjectId(id);
    return await this.messageModel
      .findByIdAndUpdate(messageIdObj, updateMessageDto, { new: true })
      .lean()
      .exec();
  }

  async updateForUser(
    id: string,
    userId: string,
    updateMessageDto: UpdateMessageDto,
  ): Promise<Message | null> {
    const message = await this.findOne(id);

    if (!message) {
      return null;
    }

    await this.chatsService.findOne(String(message.chatId), userId);
    return this.update(id, updateMessageDto);
  }
}
