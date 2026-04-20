import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Reminder } from './schemas/reminder.schema';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';

@Injectable()
export class RemindersService {
  constructor(
    @InjectModel(Reminder.name) private readonly reminderModel: Model<Reminder>,
  ) {}

  async create(userId: string, dto: CreateReminderDto) {
    return this.reminderModel.create({
      ...dto,
      userId: new Types.ObjectId(userId),
      description: dto.description ?? '',
      frequency: dto.frequency ?? 'daily',
      daysOfWeek: dto.daysOfWeek ?? [],
      enabled: dto.enabled ?? true,
      tone: dto.tone ?? 'gentle',
    });
  }

  async findAllByUser(userId: string) {
    return this.reminderModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ enabled: -1, time: 1, createdAt: -1 })
      .lean()
      .exec();
  }

  async update(userId: string, id: string, dto: UpdateReminderDto) {
    const reminder = await this.reminderModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) },
        { $set: dto },
        { new: true },
      )
      .lean()
      .exec();

    if (!reminder) {
      throw new NotFoundException('Recordatorio no encontrado');
    }

    return reminder;
  }

  async remove(userId: string, id: string) {
    const result = await this.reminderModel
      .deleteOne({
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException('Recordatorio no encontrado');
    }

    return { deleted: true };
  }
}
