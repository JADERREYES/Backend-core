import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserMemory } from './schemas/user-memory.schema';

type SuggestedMemory = {
  type: 'preference' | 'goal' | 'coping_strategy' | 'support_context' | 'summary';
  summary: string;
  source?: string;
  confidence?: number;
};

@Injectable()
export class UserMemoriesService {
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(UserMemory.name)
    private readonly userMemoryModel: Model<UserMemory>,
  ) {
    this.enabled =
      (this.configService.get<string>('ENABLE_USER_MEMORY') || 'true') ===
      'true';
  }

  async listActiveByUser(userId: string, limit = 5) {
    if (!this.enabled) {
      return [];
    }

    return this.userMemoryModel
      .find({ userId, isActive: true })
      .sort({ updatedAt: -1, confidence: -1 })
      .limit(Math.min(Math.max(limit, 1), 10))
      .lean()
      .exec();
  }

  async createOrRefresh(userId: string, memory: SuggestedMemory) {
    if (!this.enabled) {
      return null;
    }

    const summary = String(memory.summary || '').trim();
    if (!summary) {
      return null;
    }

    return this.userMemoryModel
      .findOneAndUpdate(
        {
          userId,
          type: memory.type,
          summary,
        },
        {
          $set: {
            source: memory.source || 'chat',
            confidence: Number(memory.confidence ?? 0.6),
            isActive: true,
          },
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        },
      )
      .lean()
      .exec();
  }

  async disable(userId: string, id: string) {
    return this.userMemoryModel
      .findOneAndUpdate({ _id: id, userId }, { $set: { isActive: false } }, { new: true })
      .lean()
      .exec();
  }

  async enable(userId: string, id: string) {
    return this.userMemoryModel
      .findOneAndUpdate({ _id: id, userId }, { $set: { isActive: true } }, { new: true })
      .lean()
      .exec();
  }

  async delete(userId: string, id: string) {
    const result = await this.userMemoryModel.deleteOne({ _id: id, userId }).exec();
    return { deleted: result.deletedCount > 0 };
  }

  isEnabled() {
    return this.enabled;
  }
}
