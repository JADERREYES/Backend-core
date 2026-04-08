import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SupportRequest } from './schemas/support-request.schema';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';

@Injectable()
export class SupportRequestsService {
  constructor(
    @InjectModel(SupportRequest.name)
    private readonly supportRequestModel: Model<SupportRequest>,
  ) {}

  async create(userId: string, dto: CreateSupportRequestDto) {
    return this.supportRequestModel.create({
      userId: new Types.ObjectId(userId),
      subject: dto.subject,
      message: dto.message,
      type: dto.type ?? 'general',
      status: 'open',
    });
  }

  async findAllByUser(userId: string) {
    return this.supportRequestModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findAllForAdmin() {
    return this.supportRequestModel
      .find()
      .sort({ createdAt: -1 })
      .populate('userId', 'email name')
      .lean()
      .exec();
  }
}
