import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PaymentMethod } from './schemas/payment-method.schema';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';

const normalizeCode = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

@Injectable()
export class PaymentMethodsService {
  constructor(
    @InjectModel(PaymentMethod.name)
    private readonly paymentMethodModel: Model<PaymentMethod>,
  ) {}

  async findActiveForUsers() {
    await this.ensureDefaultVisiblePaymentMethod();

    return this.paymentMethodModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean()
      .exec();
  }

  async findAllForAdmin() {
    return this.paymentMethodModel
      .find()
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean()
      .exec();
  }

  async findById(id: string) {
    const paymentMethod = await this.paymentMethodModel
      .findById(id)
      .lean()
      .exec();

    if (!paymentMethod) {
      throw new NotFoundException('Metodo de pago no encontrado');
    }

    return paymentMethod;
  }

  async create(dto: CreatePaymentMethodDto) {
    const code = normalizeCode(dto.code || dto.name);
    const exists = await this.paymentMethodModel
      .findOne({ code })
      .lean()
      .exec();

    if (exists) {
      throw new ConflictException('Ya existe un metodo de pago con ese codigo');
    }

    return this.paymentMethodModel.create({
      ...dto,
      code,
      type: dto.type || dto.provider || '',
      accountLabel: dto.accountLabel || 'Numero de pago',
      accountValue: dto.accountValue || dto.accountNumber || '',
      accountHolder: dto.accountHolder || dto.holderName || '',
      holderName: dto.holderName || dto.accountHolder || '',
      displayOrder: dto.displayOrder ?? dto.sortOrder ?? 0,
      sortOrder: dto.sortOrder ?? dto.displayOrder ?? 0,
    });
  }

  async update(id: string, dto: UpdatePaymentMethodDto) {
    const nextCode = dto.code ? normalizeCode(dto.code) : undefined;

    if (nextCode) {
      const exists = await this.paymentMethodModel
        .findOne({ code: nextCode, _id: { $ne: id } })
        .lean()
        .exec();

      if (exists) {
        throw new ConflictException(
          'Ya existe un metodo de pago con ese codigo',
        );
      }
    }

    const updated = await this.paymentMethodModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            ...dto,
            ...(nextCode ? { code: nextCode } : {}),
            ...(dto.type || dto.provider
              ? { type: dto.type || dto.provider }
              : {}),
            ...(dto.accountLabel || dto.accountValue || dto.accountNumber
              ? {
                  accountLabel: dto.accountLabel || 'Numero de pago',
                  accountValue: dto.accountValue || dto.accountNumber || '',
                }
              : {}),
            ...(dto.accountHolder || dto.holderName
              ? {
                  accountHolder: dto.accountHolder || dto.holderName,
                  holderName: dto.holderName || dto.accountHolder,
                }
              : {}),
            ...(dto.displayOrder !== undefined || dto.sortOrder !== undefined
              ? {
                  displayOrder: dto.displayOrder ?? dto.sortOrder ?? 0,
                  sortOrder: dto.sortOrder ?? dto.displayOrder ?? 0,
                }
              : {}),
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Metodo de pago no encontrado');
    }

    return updated;
  }

  async updateStatus(id: string, isActive: boolean) {
    const updated = await this.paymentMethodModel
      .findByIdAndUpdate(id, { $set: { isActive } }, { new: true })
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Metodo de pago no encontrado');
    }

    return updated;
  }

  async remove(id: string) {
    const removed = await this.paymentMethodModel
      .findByIdAndDelete(id)
      .lean()
      .exec();

    if (!removed) {
      throw new NotFoundException('Metodo de pago no encontrado');
    }

    return { deleted: true, id };
  }

  async ensureDefaultVisiblePaymentMethod() {
    const activeMethod = await this.paymentMethodModel
      .findOne({ isActive: true })
      .sort({ sortOrder: 1, createdAt: 1 })
      .exec();

    if (activeMethod) {
      return activeMethod;
    }

    let paymentMethod = await this.paymentMethodModel
      .findOne({ code: 'nequi' })
      .exec();

    if (!paymentMethod) {
      paymentMethod = await this.paymentMethodModel.create({
        name: 'Nequi',
        code: 'nequi',
        provider: 'Nequi',
        type: 'wallet',
        accountLabel: 'Numero de pago',
        accountValue: '3001234567',
        accountNumber: '3001234567',
        accountHolder: 'MenteAmiga',
        holderName: 'MenteAmiga',
        instructions:
          'Realiza la transferencia y comparte el comprobante desde la app.',
        isActive: true,
        displayOrder: 0,
        sortOrder: 0,
      });
    } else if (!paymentMethod.isActive) {
      paymentMethod.isActive = true;
      await paymentMethod.save();
    }

    return paymentMethod;
  }
}
