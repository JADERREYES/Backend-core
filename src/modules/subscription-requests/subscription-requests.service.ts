import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SubscriptionRequest } from './schemas/subscription-request.schema';
import { CreateSubscriptionRequestDto } from './dto/create-subscription-request.dto';
import { UpdateSubscriptionRequestStatusDto } from './dto/update-subscription-request-status.dto';
import { UpdateSubscriptionRequestNotesDto } from './dto/update-subscription-request-notes.dto';
import { User } from '../users/schemas/user.schema';
import { PlansService } from '../plans/plans.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ActivateSubscriptionRequestDto } from './dto/activate-subscription-request.dto';
import { StorageService } from '../../common/storage/storage.service';

@Injectable()
export class SubscriptionRequestsService {
  constructor(
    @InjectModel(SubscriptionRequest.name)
    private readonly subscriptionRequestModel: Model<SubscriptionRequest>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly plansService: PlansService,
    private readonly paymentMethodsService: PaymentMethodsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly storageService: StorageService,
  ) {}

  async create(userId: string, dto: CreateSubscriptionRequestDto, file?: any) {
    const userObjectId = new Types.ObjectId(userId);
    const [user, currentSubscription] = await Promise.all([
      this.userModel.findById(userObjectId).lean().exec(),
      this.subscriptionsService.findByUserId(userId),
    ]);

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const [plan, paymentMethod] = await Promise.all([
      this.plansService.findByIdOrFail(dto.planId),
      this.paymentMethodsService.findById(dto.paymentMethodId),
    ]);

    if (!plan.isActive) {
      throw new BadRequestException('El plan seleccionado no esta activo');
    }

    if (!paymentMethod.isActive) {
      throw new BadRequestException('El metodo de pago seleccionado no esta activo');
    }

    if (plan.category === 'free') {
      throw new BadRequestException('No se puede solicitar el plan free por pago manual');
    }

    if (plan.category === 'trial') {
      throw new BadRequestException('El plan trial no se solicita por pago manual');
    }

    const uploadedProof = file
      ? await this.storageService.upload({
          buffer: file.buffer,
          originalName: file.originalname,
          mimeType: file.mimetype,
          folder: 'subscription-proofs',
          resourceType: file.mimetype?.startsWith('image/') ? 'image' : 'raw',
        })
      : null;

    return this.subscriptionRequestModel.create({
      userId: userObjectId,
      userName: user.name || user.email.split('@')[0],
      userEmail: user.email,
      currentPlanCode: currentSubscription.planCode || 'free',
      currentPlanName: currentSubscription.planName || 'Free',
      currentUsage: {
        used: currentSubscription?.usageSnapshot?.messages?.used || 0,
        limit: currentSubscription?.usageSnapshot?.messages?.limit || 100,
      },
      planId: plan._id,
      planName: plan.name,
      planCode: plan.code,
      requestType: dto.requestType,
      requestedPlanCode: dto.requestedPlanCode || plan.code,
      requestedTokens: dto.requestedTokens || 0,
      planSnapshot: {
        price: plan.price,
        currency: plan.currency,
        durationDays: plan.durationDays,
        limits: plan.limits,
      },
      paymentMethodId: paymentMethod._id,
      paymentMethodSnapshot: {
        name: paymentMethod.name,
        code: paymentMethod.code,
        accountLabel: paymentMethod.accountLabel || 'Numero de pago',
        accountValue:
          paymentMethod.accountValue || paymentMethod.accountNumber || '',
        holderName: paymentMethod.holderName || paymentMethod.accountHolder || '',
        accountNumber: paymentMethod.accountNumber,
        instructions: paymentMethod.instructions,
      },
      payerName: dto.payerName?.trim() || '',
      payerPhone: dto.payerPhone?.trim() || '',
      reportedAmount: Number(dto.reportedAmount || 0),
      paidAtReference: dto.paidAtReference?.trim() || '',
      message: dto.message?.trim() || '',
      proofUrl: uploadedProof?.fileUrl || '',
      proofStorageProvider: uploadedProof?.provider || '',
      proofStorageKey: uploadedProof?.key || '',
      proofFileUrl: uploadedProof?.fileUrl || '',
      receiptUrl: uploadedProof?.fileUrl || '',
      proofOriginalName: file?.originalname || '',
      receiptFileName: uploadedProof?.fileName || file?.originalname || '',
      proofMimeType: uploadedProof?.mimeType || file?.mimetype || '',
      proofSize: uploadedProof?.size || file?.size || 0,
      status: file ? 'receipt_uploaded' : 'submitted',
      adminNotes: '',
    });
  }

  async findMine(userId: string) {
    return this.subscriptionRequestModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findMineById(userId: string, id: string) {
    const item = await this.subscriptionRequestModel
      .findOne({ _id: id, userId: new Types.ObjectId(userId) })
      .lean()
      .exec();

    if (!item) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    return item;
  }

  async findAllForAdmin() {
    return this.subscriptionRequestModel
      .find()
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findByIdForAdmin(id: string) {
    const item = await this.subscriptionRequestModel.findById(id).lean().exec();

    if (!item) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    return item;
  }

  async updateStatus(
    id: string,
    adminUserId: string,
    dto: UpdateSubscriptionRequestStatusDto,
  ) {
    if (dto.status === 'activated') {
      return this.activate(id, adminUserId, {});
    }

    const updated = await this.subscriptionRequestModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: dto.status,
            reviewedBy: new Types.ObjectId(adminUserId),
            reviewedAt: new Date(),
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    return updated;
  }

  async updateNotes(
    id: string,
    adminUserId: string,
    dto: UpdateSubscriptionRequestNotesDto,
  ) {
    const updated = await this.subscriptionRequestModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            adminNotes: dto.adminNotes,
            reviewedBy: new Types.ObjectId(adminUserId),
            reviewedAt: new Date(),
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    return updated;
  }

  async activate(
    id: string,
    adminUserId: string,
    dto: ActivateSubscriptionRequestDto,
  ) {
    const request = await this.subscriptionRequestModel.findById(id).lean().exec();

    if (!request) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    if (request.status === 'rejected') {
      throw new BadRequestException('No se puede activar una solicitud rechazada');
    }

    const previousSubscription = await this.subscriptionsService.findByUserId(
      request.userId.toString(),
    );

    const subscription = await this.subscriptionsService.activatePlanForUser({
      userId: request.userId.toString(),
      adminUserId,
      planId: request.planId?.toString(),
      planName: request.planName,
      planCode: request.planCode,
      planCategory: request.requestType as
        | 'premium'
        | 'extra_tokens'
        | 'custom',
      amount: request.planSnapshot?.price || 0,
      currency: request.planSnapshot?.currency || 'COP',
      durationDays: request.planSnapshot?.durationDays || 30,
      limits: request.planSnapshot?.limits || {},
      requestId: request._id.toString(),
      adminNotes: dto.adminNotes || request.adminNotes || '',
      paymentMethodCode: request.paymentMethodSnapshot?.code || '',
    });

    const updated = await this.subscriptionRequestModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: 'activated',
            adminNotes: dto.adminNotes ?? request.adminNotes ?? '',
            reviewedBy: new Types.ObjectId(adminUserId),
            reviewedAt: new Date(),
            activatedSubscriptionId: subscription._id,
            currentPlanCode:
              request.currentPlanCode || previousSubscription.planCode || 'free',
            currentPlanName:
              request.currentPlanName || previousSubscription.planName || 'Free',
            activatedPlanId: subscription.planId || null,
            activatedPlanName: subscription.planName || request.planName,
            activatedPlanCode: subscription.planCode || request.planCode,
            activatedPlanCategory:
              subscription.planCategory || (request.requestType as string),
            activatedSubscriptionStatus: subscription.status || 'active',
            activatedAmount:
              typeof subscription.amount === 'number'
                ? subscription.amount
                : request.planSnapshot?.price || 0,
            activatedCurrency:
              subscription.currency || request.planSnapshot?.currency || 'COP',
            activatedLimits:
              subscription.limits || request.planSnapshot?.limits || {},
            activatedStartDate:
              subscription.startDate || subscription.startedAt || new Date(),
            activatedEndDate:
              subscription.endDate || subscription.expiresAt || null,
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    return {
      request: updated,
      subscription,
    };
  }
}
