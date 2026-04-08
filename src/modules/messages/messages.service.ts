import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message } from './schemas/message.schema';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

@Injectable()
export class MessagesService {
  constructor(@InjectModel(Message.name) private messageModel: Model<Message>) {}

  async create(createMessageDto: CreateMessageDto): Promise<Message> {
  const newMessage = new this.messageModel({
    ...createMessageDto,
    chatId: new Types.ObjectId(createMessageDto.chatId),
    senderId: new Types.ObjectId(createMessageDto.senderId),
  });
  return await newMessage.save();
}

  async findByChatId(chatId: string): Promise<Message[]> {
    const chatIdObj = new Types.ObjectId(chatId);
    return await this.messageModel.find({ chatId: chatIdObj }).sort({ createdAt: 1 }).lean().exec();
  }

  async findOne(messageId: string): Promise<Message | null> {
    const messageIdObj = new Types.ObjectId(messageId);
    return await this.messageModel.findById(messageIdObj).lean().exec();
  }

  async deleteByChatId(chatId: string): Promise<void> {
    const chatIdObj = new Types.ObjectId(chatId);
    await this.messageModel.deleteMany({ chatId: chatIdObj }).exec();
  }

  async update(id: string, updateMessageDto: UpdateMessageDto): Promise<Message | null> {
    const messageIdObj = new Types.ObjectId(id);
    return await this.messageModel
      .findByIdAndUpdate(messageIdObj, updateMessageDto, { new: true })
      .lean()
      .exec();
  }
}