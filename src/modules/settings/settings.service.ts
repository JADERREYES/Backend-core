import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Setting } from './schemas/setting.schema';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Setting.name) private settingModel: Model<Setting>,
  ) {}

  async getSettings() {
    const settings = await this.settingModel
      .findOneAndUpdate(
        { key: 'global' },
        { $setOnInsert: { key: 'global' } },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    return settings;
  }

  async updateSettings(payload: Record<string, unknown>) {
    return this.settingModel
      .findOneAndUpdate({ key: 'global' }, { $set: payload }, { upsert: true, new: true })
      .lean()
      .exec();
  }
}
