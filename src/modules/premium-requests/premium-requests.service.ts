import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PremiumRequest } from './schemas/premium-request.schema';
import { CreatePremiumRequestDto } from './dto/create-premium-request.dto';
import { UpdatePremiumRequestStatusDto } from './dto/update-premium-request-status.dto';
import { UpdatePremiumRequestNotesDto } from './dto/update-premium-request-notes.dto';
import { User } from '../users/schemas/user.schema';
import { Subscription } from '../subscriptions/schemas/subscription.schema';

@Injectable()
export class PremiumRequestsService {
  constructor(
    @InjectModel(PremiumRequest.name)
    private readonly premiumRequestModel: Model<PremiumRequest>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<Subscription>,
  ) {}

  async create(userId: string, dto: CreatePremiumRequestDto) {
    const userObjectId = new Types.ObjectId(userId);
    const [user, subscription] = await Promise.all([
      this.userModel.findById(userObjectId).lean().exec(),
      this.subscriptionModel.findOne({ userId: userObjectId }).lean().exec(),
    ]);

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const used = subscription?.currentUsage?.messagesUsed || 0;
    const limit = subscription?.limits?.maxMessagesPerMonth || 100;
    const usageRatio = limit > 0 ? used / limit : 0;

    return this.premiumRequestModel.create({
      userId: userObjectId,
      name: user.name || user.email.split('@')[0],
      email: user.email,
      currentPlan: subscription?.planCode || 'free',
      currentUsage: {
        used,
        limit,
        usageRatio,
        upgradeRecommended: usageRatio >= 0.8,
      },
      requestType: dto.requestType,
      message: dto.message,
      paymentMethod: dto.paymentMethod || 'nequi',
      status: 'new',
      adminNotes: '',
    });
  }

  async findMine(userId: string) {
    return this.premiumRequestModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findAllForAdmin() {
    return this.premiumRequestModel
      .find()
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async updateStatus(id: string, dto: UpdatePremiumRequestStatusDto) {
    const updated = await this.premiumRequestModel
      .findByIdAndUpdate(id, { status: dto.status }, { new: true })
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Solicitud premium no encontrada');
    }

    return updated;
  }

  async updateNotes(id: string, dto: UpdatePremiumRequestNotesDto) {
    const updated = await this.premiumRequestModel
      .findByIdAndUpdate(id, { adminNotes: dto.adminNotes }, { new: true })
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Solicitud premium no encontrada');
    }

    return updated;
  }
}
