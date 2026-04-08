import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Alert } from './schemas/alert.schema';
import { UpdateAlertDto } from './dto/update-alert.dto';

@Injectable()
export class AlertsService {
  constructor(@InjectModel(Alert.name) private alertModel: Model<Alert>) {}

  async findAll() {
    return this.alertModel.find().sort({ createdAt: -1 }).lean().exec();
  }

  async updateStatus(
    id: string,
    status: 'open' | 'investigating' | 'resolved',
  ) {
    return this.update(id, { status });
  }

  async update(id: string, payload: UpdateAlertDto) {
    const alert = await this.alertModel
      .findByIdAndUpdate(id, { $set: payload }, { new: true })
      .lean()
      .exec();

    if (!alert) {
      throw new NotFoundException('Alerta no encontrada');
    }

    return alert;
  }
}
