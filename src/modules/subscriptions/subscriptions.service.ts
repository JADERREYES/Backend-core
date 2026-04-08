import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subscription } from './schemas/subscription.schema';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { User } from '../users/schemas/user.schema';
import { PlansService } from '../plans/plans.service';
import { SubscriptionActivation } from './schemas/subscription-activation.schema';

const DEFAULT_LIMITS = {
  maxChatsPerMonth: 10,
  maxMessagesPerMonth: 100,
  maxDocumentsMB: 50,
  monthlyTokens: 100,
  extraTokens: 0,
};

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<Subscription>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(SubscriptionActivation.name)
    private readonly activationModel: Model<SubscriptionActivation>,
    private readonly plansService: PlansService,
  ) {}

  async ensureUserSubscription(userId: string) {
    const userIdObj = new Types.ObjectId(userId);
    let subscription = await this.subscriptionModel
      .findOne({ userId: userIdObj })
      .lean()
      .exec();

    if (!subscription) {
      const defaultPlan = await this.plansService.ensureDefaultFreePlan();
      const startDate = new Date();
      const endDate = new Date(
        startDate.getTime() + defaultPlan.durationDays * 24 * 60 * 60 * 1000,
      );

      const created = await this.subscriptionModel.create({
        userId: userIdObj,
        planId: defaultPlan._id,
        planName: defaultPlan.name,
        planCode: defaultPlan.code,
        planCategory: defaultPlan.category,
        status: 'active',
        amount: defaultPlan.price,
        currency: defaultPlan.currency,
        limits: {
          ...DEFAULT_LIMITS,
          ...(defaultPlan.limits || {}),
        },
        currentUsage: {
          chatsUsed: 0,
          messagesUsed: 0,
          documentsUsedMB: 0,
          tokensUsed: 0,
        },
        autoRenew: false,
        startDate,
        startedAt: startDate,
        endDate,
        expiresAt: endDate,
        tokenLimit:
          defaultPlan.tokenLimit ?? defaultPlan.limits?.monthlyTokens ?? 100,
        tokensRemaining:
          defaultPlan.tokenLimit ?? defaultPlan.limits?.monthlyTokens ?? 100,
        dailyMessageLimit: defaultPlan.dailyMessageLimit ?? 0,
        monthlyMessageLimit:
          defaultPlan.monthlyMessageLimit ??
          defaultPlan.limits?.maxMessagesPerMonth ??
          100,
      });

      subscription = created.toObject();
    }

    return subscription;
  }

  async create(userId: string, createSubscriptionDto: CreateSubscriptionDto) {
    const userIdObj = new Types.ObjectId(userId);
    const newSubscription = new this.subscriptionModel({
      ...createSubscriptionDto,
      userId: userIdObj,
      planId: createSubscriptionDto.planId
        ? new Types.ObjectId(createSubscriptionDto.planId)
        : null,
      sourceRequestId: createSubscriptionDto.sourceRequestId
        ? new Types.ObjectId(createSubscriptionDto.sourceRequestId)
        : null,
      limits: {
        ...DEFAULT_LIMITS,
        ...(createSubscriptionDto.limits || {}),
      },
      currentUsage: {
        chatsUsed: 0,
        messagesUsed: 0,
        documentsUsedMB: 0,
        tokensUsed: 0,
      },
      startDate: createSubscriptionDto.startDate
        ? new Date(createSubscriptionDto.startDate)
        : new Date(),
      startedAt: createSubscriptionDto.startDate
        ? new Date(createSubscriptionDto.startDate)
        : new Date(),
      endDate: createSubscriptionDto.endDate
        ? new Date(createSubscriptionDto.endDate)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      expiresAt: createSubscriptionDto.endDate
        ? new Date(createSubscriptionDto.endDate)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    return newSubscription.save();
  }

  async findByUserId(userId: string) {
    const subscription = await this.ensureUserSubscription(userId);
    const usageSnapshot = this.buildUsageSnapshot(subscription);

    return {
      ...subscription,
      usageSnapshot,
      upgradeRecommendation: usageSnapshot.recommendedPlanCategory,
    };
  }

  async update(userId: string, updateSubscriptionDto: UpdateSubscriptionDto) {
    const userIdObj = new Types.ObjectId(userId);
    await this.ensureUserSubscription(userId);

    const updatedSubscription = await this.subscriptionModel
      .findOneAndUpdate(
        { userId: userIdObj },
        {
          $set: {
            ...updateSubscriptionDto,
            ...(updateSubscriptionDto.planId
              ? { planId: new Types.ObjectId(updateSubscriptionDto.planId) }
              : {}),
            ...(updateSubscriptionDto.sourceRequestId
              ? {
                  sourceRequestId: new Types.ObjectId(
                    updateSubscriptionDto.sourceRequestId,
                  ),
                }
              : {}),
            ...(updateSubscriptionDto.limits
              ? {
                  limits: {
                    ...DEFAULT_LIMITS,
                    ...updateSubscriptionDto.limits,
                  },
                }
              : {}),
            ...(updateSubscriptionDto.startDate
              ? {
                  startDate: new Date(updateSubscriptionDto.startDate),
                  startedAt: new Date(updateSubscriptionDto.startDate),
                }
              : {}),
            ...(updateSubscriptionDto.endDate
              ? {
                  endDate: new Date(updateSubscriptionDto.endDate),
                  expiresAt: new Date(updateSubscriptionDto.endDate),
                }
              : {}),
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    if (!updatedSubscription) {
      throw new NotFoundException('Suscripcion no encontrada');
    }

    return updatedSubscription;
  }

  async getUsage(userId: string) {
    const subscription = await this.ensureUserSubscription(userId);
    return this.buildUsageSnapshot(subscription);
  }

  async incrementUsage(
    userId: string,
    field:
      | 'chatsUsed'
      | 'messagesUsed'
      | 'documentsUsedMB'
      | 'tokensUsed',
    amount = 1,
  ) {
    const userIdObj = new Types.ObjectId(userId);
    await this.ensureUserSubscription(userId);
    await this.subscriptionModel
      .updateOne(
        { userId: userIdObj },
        { $inc: { [`currentUsage.${field}`]: amount } },
      )
      .exec();
  }

  async findAllForAdmin() {
    const subscriptions = await this.subscriptionModel.find().lean().exec();
    const userIds = subscriptions.map((subscription: any) => subscription.userId);
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('email name')
      .lean()
      .exec();

    const usersById = new Map(
      users.map((user: any) => [user._id.toString(), user]),
    );

    return subscriptions.map((subscription: any) => {
      const user = usersById.get(subscription.userId.toString());

      return {
        ...subscription,
        userName: user?.name || user?.email || subscription.userId.toString(),
        usageSnapshot: this.buildUsageSnapshot(subscription),
      };
    });
  }

  async updateById(id: string, updateSubscriptionDto: UpdateSubscriptionDto) {
    const current = await this.subscriptionModel.findById(id).lean().exec();
    if (!current) {
      throw new NotFoundException('Suscripcion no encontrada');
    }

    const updatedSubscription = await this.subscriptionModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            ...updateSubscriptionDto,
            ...(updateSubscriptionDto.planId
              ? { planId: new Types.ObjectId(updateSubscriptionDto.planId) }
              : {}),
            ...(updateSubscriptionDto.sourceRequestId
              ? {
                  sourceRequestId: new Types.ObjectId(
                    updateSubscriptionDto.sourceRequestId,
                  ),
                }
              : {}),
            ...(updateSubscriptionDto.limits
              ? {
                  limits: {
                    ...DEFAULT_LIMITS,
                    ...(current.limits || {}),
                    ...updateSubscriptionDto.limits,
                  },
                }
              : {}),
            ...(updateSubscriptionDto.startDate
              ? {
                  startDate: new Date(updateSubscriptionDto.startDate),
                  startedAt: new Date(updateSubscriptionDto.startDate),
                }
              : {}),
            ...(updateSubscriptionDto.endDate
              ? {
                  endDate: new Date(updateSubscriptionDto.endDate),
                  expiresAt: new Date(updateSubscriptionDto.endDate),
                }
              : {}),
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    return updatedSubscription;
  }

  async activatePlanForUser(params: {
    userId: string;
    adminUserId: string;
    planId?: string | null;
    planName: string;
    planCode: string;
    planCategory: 'free' | 'premium' | 'extra_tokens' | 'custom';
    amount?: number;
    currency?: string;
    durationDays: number;
    limits?: Record<string, number>;
    requestId?: string | null;
    adminNotes?: string;
    paymentMethodCode?: string;
  }) {
    const userIdObj = new Types.ObjectId(params.userId);
    const adminUserIdObj = new Types.ObjectId(params.adminUserId);
    const existing = await this.ensureUserSubscription(params.userId);
    const now = new Date();
    const startDate =
      existing.endDate && new Date(existing.endDate) > now
        ? new Date(existing.startDate || now)
        : now;
    const endDate = new Date(
      now.getTime() + params.durationDays * 24 * 60 * 60 * 1000,
    );

    const nextLimits = {
      ...DEFAULT_LIMITS,
      ...(existing.limits || {}),
      ...(params.limits || {}),
    };

    const nextCurrentUsage =
      params.planCategory === 'extra_tokens'
        ? {
            ...(existing.currentUsage || {}),
          }
        : {
            chatsUsed: 0,
            messagesUsed: 0,
            documentsUsedMB: 0,
            tokensUsed: 0,
          };

    const subscription = await this.subscriptionModel
      .findOneAndUpdate(
        { userId: userIdObj },
        {
          $set: {
            planId: params.planId ? new Types.ObjectId(params.planId) : null,
            planName: params.planName,
            planCode: params.planCode,
            planCategory: params.planCategory,
            status: 'active',
            amount: params.amount ?? 0,
            currency: params.currency ?? 'COP',
            limits: nextLimits,
            currentUsage: nextCurrentUsage,
            startDate,
            startedAt: startDate,
            endDate,
            expiresAt: endDate,
            sourceRequestId: params.requestId
              ? new Types.ObjectId(params.requestId)
              : null,
            lastApprovedBy: adminUserIdObj,
            grantedBy: adminUserIdObj,
            lastApprovedAt: now,
            paymentMethodCode: params.paymentMethodCode ?? '',
            tokenLimit:
              Number(nextLimits.monthlyTokens ?? 0) +
              Number(nextLimits.extraTokens ?? 0),
            tokensRemaining:
              Number(nextLimits.monthlyTokens ?? 0) +
              Number(nextLimits.extraTokens ?? 0),
            dailyMessageLimit: Number((nextLimits as any).dailyMessageLimit ?? 0),
            monthlyMessageLimit: Number(nextLimits.maxMessagesPerMonth ?? 0),
            notes: params.adminNotes || '',
          },
        },
        { new: true, upsert: true },
      )
      .exec();

    await this.activationModel.create({
      userId: userIdObj,
      subscriptionId: subscription._id,
      planId: params.planId ? new Types.ObjectId(params.planId) : null,
      planName: params.planName,
      planCode: params.planCode,
      planCategory: params.planCategory,
      amount: params.amount ?? 0,
      currency: params.currency ?? 'COP',
      limits: nextLimits,
      startDate,
      endDate,
      approvedBy: adminUserIdObj,
      approvedAt: now,
      requestId: params.requestId ? new Types.ObjectId(params.requestId) : null,
      adminNotes: params.adminNotes || '',
    });

    return subscription.toObject();
  }

  async getActivationHistoryForUser(userId: string) {
    return this.activationModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ approvedAt: -1, createdAt: -1 })
      .lean()
      .exec();
  }

  async findByUserIdForAdmin(userId: string) {
    const item = await this.subscriptionModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean()
      .exec();

    if (!item) {
      throw new NotFoundException('Suscripcion no encontrada');
    }

    return {
      ...item,
      usageSnapshot: this.buildUsageSnapshot(item),
    };
  }

  private buildUsageSnapshot(subscription: any) {
    const usage = subscription.currentUsage || {};
    const limits = {
      ...DEFAULT_LIMITS,
      ...(subscription.limits || {}),
    };
    const messagesUsed = Number(usage.messagesUsed ?? 0);
    const messageLimit = Number(limits.maxMessagesPerMonth ?? 0);
    const tokensUsed = Number(usage.tokensUsed ?? 0);
    const tokenLimit =
      Number(limits.monthlyTokens ?? 0) + Number(limits.extraTokens ?? 0);
    const chatsUsed = Number(usage.chatsUsed ?? 0);
    const chatLimit = Number(limits.maxChatsPerMonth ?? 0);

    const maxRatio = Math.max(
      messageLimit > 0 ? messagesUsed / messageLimit : 0,
      tokenLimit > 0 ? tokensUsed / tokenLimit : 0,
      chatLimit > 0 ? chatsUsed / chatLimit : 0,
    );

    return {
      chats: {
        used: chatsUsed,
        limit: chatLimit,
      },
      messages: {
        used: messagesUsed,
        limit: messageLimit,
      },
      documents: {
        used: Number(usage.documentsUsedMB ?? 0),
        limit: Number(limits.maxDocumentsMB ?? 0),
      },
      tokens: {
        used: tokensUsed,
        limit: tokenLimit,
        extraIncluded: Number(limits.extraTokens ?? 0),
      },
      usageRatio: maxRatio,
      upgradeRecommended: maxRatio >= 0.8,
      recommendedPlanCategory:
        maxRatio >= 0.95
          ? 'custom'
          : maxRatio >= 0.8
            ? 'premium'
            : subscription.planCategory === 'free'
              ? 'premium'
              : 'extra_tokens',
    };
  }
}
