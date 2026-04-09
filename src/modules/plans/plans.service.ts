import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Plan } from './schemas/plan.schema';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

const normalizeCode = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

const DEFAULT_LIMITS = {
  maxChatsPerMonth: 10,
  maxMessagesPerMonth: 100,
  maxDocumentsMB: 50,
  monthlyTokens: 100,
  extraTokens: 0,
};

const TRIAL_LIMITS = {
  maxChatsPerMonth: 20,
  maxMessagesPerMonth: 200,
  maxDocumentsMB: 75,
  monthlyTokens: 250,
  extraTokens: 0,
};

@Injectable()
export class PlansService {
  constructor(@InjectModel(Plan.name) private readonly planModel: Model<Plan>) {}

  async findActiveForUsers() {
    return this.planModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, price: 1, createdAt: 1 })
      .lean()
      .exec();
  }

  async findAllForAdmin() {
    return this.planModel
      .find()
      .sort({ sortOrder: 1, price: 1, createdAt: 1 })
      .lean()
      .exec();
  }

  async findById(id: string) {
    const plan = await this.planModel.findById(id).lean().exec();

    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    return plan;
  }

  async findByIdOrFail(id: string) {
    const plan = await this.planModel.findById(id).exec();

    if (!plan) {
      throw new NotFoundException('Plan no encontrado');
    }

    return plan;
  }

  async create(dto: CreatePlanDto) {
    const code = normalizeCode(dto.code || dto.name);
    const exists = await this.planModel.findOne({ code }).lean().exec();

    if (exists) {
      throw new ConflictException('Ya existe un plan con ese codigo');
    }

    if (dto.isDefault) {
      await this.planModel.updateMany({}, { $set: { isDefault: false } }).exec();
    }

    return this.planModel.create({
      ...dto,
      code,
      tokenLimit:
        dto.tokenLimit ?? dto.limits?.monthlyTokens ?? DEFAULT_LIMITS.monthlyTokens,
      dailyMessageLimit: dto.dailyMessageLimit ?? 0,
      monthlyMessageLimit:
        dto.monthlyMessageLimit ??
        dto.limits?.maxMessagesPerMonth ??
        DEFAULT_LIMITS.maxMessagesPerMonth,
      displayOrder: dto.displayOrder ?? dto.sortOrder ?? 0,
      sortOrder: dto.sortOrder ?? dto.displayOrder ?? 0,
      limits: {
        ...DEFAULT_LIMITS,
        monthlyTokens:
          dto.tokenLimit ?? dto.limits?.monthlyTokens ?? DEFAULT_LIMITS.monthlyTokens,
        maxMessagesPerMonth:
          dto.monthlyMessageLimit ??
          dto.limits?.maxMessagesPerMonth ??
          DEFAULT_LIMITS.maxMessagesPerMonth,
        ...(dto.limits || {}),
      },
    });
  }

  async update(id: string, dto: UpdatePlanDto) {
    const nextCode = dto.code ? normalizeCode(dto.code) : undefined;

    if (nextCode) {
      const exists = await this.planModel
        .findOne({ code: nextCode, _id: { $ne: id } })
        .lean()
        .exec();

      if (exists) {
        throw new ConflictException('Ya existe un plan con ese codigo');
      }
    }

    if (dto.isDefault) {
      await this.planModel
        .updateMany({ _id: { $ne: id } }, { $set: { isDefault: false } })
        .exec();
    }

    const current = await this.planModel.findById(id).lean().exec();
    if (!current) {
      throw new NotFoundException('Plan no encontrado');
    }

    const updated = await this.planModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            ...dto,
            ...(nextCode ? { code: nextCode } : {}),
            ...(dto.tokenLimit !== undefined ? { tokenLimit: dto.tokenLimit } : {}),
            ...(dto.dailyMessageLimit !== undefined
              ? { dailyMessageLimit: dto.dailyMessageLimit }
              : {}),
            ...(dto.monthlyMessageLimit !== undefined
              ? { monthlyMessageLimit: dto.monthlyMessageLimit }
              : {}),
            ...(dto.displayOrder !== undefined || dto.sortOrder !== undefined
              ? {
                  displayOrder: dto.displayOrder ?? dto.sortOrder ?? 0,
                  sortOrder: dto.sortOrder ?? dto.displayOrder ?? 0,
                }
              : {}),
            ...(dto.limits
              ? {
                  limits: {
                    ...DEFAULT_LIMITS,
                    ...(current.limits || {}),
                    monthlyTokens:
                      dto.tokenLimit ??
                      dto.limits.monthlyTokens ??
                      current.limits?.monthlyTokens ??
                      DEFAULT_LIMITS.monthlyTokens,
                    maxMessagesPerMonth:
                      dto.monthlyMessageLimit ??
                      dto.limits.maxMessagesPerMonth ??
                      current.limits?.maxMessagesPerMonth ??
                      DEFAULT_LIMITS.maxMessagesPerMonth,
                    ...dto.limits,
                  },
                }
              : {}),
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    return updated;
  }

  async ensureDefaultFreePlan() {
    let plan = await this.planModel
      .findOne({ category: 'free', isDefault: true })
      .exec();

    if (!plan) {
      plan = await this.planModel.findOne({ code: 'free' }).exec();
    }

    if (!plan) {
      plan = await this.planModel.create({
        name: 'Free',
        code: 'free',
        description: 'Plan base gratuito',
        category: 'free',
        price: 0,
        currency: 'COP',
        durationDays: 30,
        tokenLimit: DEFAULT_LIMITS.monthlyTokens,
        dailyMessageLimit: 0,
        monthlyMessageLimit: DEFAULT_LIMITS.maxMessagesPerMonth,
        features: [],
        limits: DEFAULT_LIMITS,
        isActive: true,
        isDefault: true,
        isCustomizable: false,
        displayOrder: 0,
        sortOrder: 0,
      });
    }

    return plan;
  }

  async ensureDefaultTrialPlan() {
    let plan = await this.planModel
      .findOne({ category: 'trial', code: 'trial' })
      .exec();

    if (!plan) {
      plan = await this.planModel.create({
        name: 'Trial',
        code: 'trial',
        description: 'Acceso de prueba por tiempo limitado',
        category: 'trial',
        price: 0,
        currency: 'COP',
        durationDays: 5,
        tokenLimit: TRIAL_LIMITS.monthlyTokens,
        dailyMessageLimit: 0,
        monthlyMessageLimit: TRIAL_LIMITS.maxMessagesPerMonth,
        features: ['trial'],
        limits: TRIAL_LIMITS,
        isActive: true,
        isDefault: false,
        isCustomizable: false,
        displayOrder: 1,
        sortOrder: 1,
      });
    }

    return plan;
  }

  async updateStatus(id: string, isActive: boolean) {
    const updated = await this.planModel
      .findByIdAndUpdate(id, { $set: { isActive } }, { new: true })
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Plan no encontrado');
    }

    return updated;
  }

  async remove(id: string) {
    const removed = await this.planModel.findByIdAndDelete(id).lean().exec();

    if (!removed) {
      throw new NotFoundException('Plan no encontrado');
    }

    return { deleted: true, id };
  }
}
