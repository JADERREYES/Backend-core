import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Chat, ChatStatus } from './schemas/chat.schema';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';

@Injectable()
export class ChatsService {
  constructor(@InjectModel(Chat.name) private chatModel: Model<Chat>) {}

  async create(userId: string, createChatDto: CreateChatDto): Promise<Chat> {
    const userIdObj = new Types.ObjectId(userId);
    const newChat = new this.chatModel({
      ...createChatDto,
      userId: userIdObj,
      lastMessageAt: new Date(),
    });
    return await newChat.save();
  }

  async findAllByUser(userId: string): Promise<Chat[]> {
    const userIdObj = new Types.ObjectId(userId);
    return await this.chatModel
      .find({ userId: userIdObj, status: { $ne: ChatStatus.DELETED } })
      .sort({ lastMessageAt: -1 })
      .lean()
      .exec();
  }

  async findOne(chatId: string, userId: string): Promise<Chat | null> {
    const chatIdObj = new Types.ObjectId(chatId);
    const userIdObj = new Types.ObjectId(userId);

    const chat = await this.chatModel
      .findOne({
        _id: chatIdObj,
        userId: userIdObj,
        status: { $ne: ChatStatus.DELETED },
      })
      .lean()
      .exec();

    if (!chat) throw new NotFoundException('Chat no encontrado');
    return chat;
  }

  async update(
    chatId: string,
    userId: string,
    updateChatDto: UpdateChatDto,
  ): Promise<Chat | null> {
    const chatIdObj = new Types.ObjectId(chatId);
    const userIdObj = new Types.ObjectId(userId);

    const updatedChat = await this.chatModel
      .findOneAndUpdate(
        { _id: chatIdObj, userId: userIdObj },
        { $set: updateChatDto },
        { new: true },
      )
      .lean()
      .exec();

    if (!updatedChat) throw new NotFoundException('Chat no encontrado');
    return updatedChat;
  }

  async archive(chatId: string, userId: string): Promise<Chat | null> {
    return this.update(chatId, userId, { status: ChatStatus.ARCHIVED } as any);
  }

  async pin(chatId: string, userId: string): Promise<Chat | null> {
    // Implementar lógica de pin si es necesario
    return this.findOne(chatId, userId);
  }

  async delete(chatId: string, userId: string): Promise<void> {
    const chatIdObj = new Types.ObjectId(chatId);
    const userIdObj = new Types.ObjectId(userId);

    const result = await this.chatModel
      .updateOne(
        { _id: chatIdObj, userId: userIdObj },
        { status: ChatStatus.DELETED },
      )
      .exec();
    if (result.matchedCount === 0)
      throw new NotFoundException('Chat no encontrado');
  }

  async incrementMessageCount(chatId: string): Promise<void> {
    const chatIdObj = new Types.ObjectId(chatId);
    await this.chatModel
      .updateOne(
        { _id: chatIdObj },
        { $inc: { messageCount: 1 }, $set: { lastMessageAt: new Date() } },
      )
      .exec();
  }
}
