import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Profile } from './schemas/profile.schema';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateCheckInDto } from './dto/create-checkin.dto';
import { ChatsService } from '../chats/chats.service';
import { RemindersService } from '../reminders/reminders.service';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    private readonly chatsService: ChatsService,
    private readonly remindersService: RemindersService,
  ) {}

  async create(
    userId: string,
    createProfileDto: CreateProfileDto,
  ): Promise<Profile> {
    const userIdObj = new Types.ObjectId(userId);
    const newProfile = new this.profileModel({
      ...createProfileDto,
      userId: userIdObj,
    });
    return await newProfile.save();
  }

  async findByUserId(userId: string): Promise<Profile | null> {
    const userIdObj = new Types.ObjectId(userId);
    return await this.profileModel.findOne({ userId: userIdObj }).lean().exec();
  }

  async update(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<Profile | null> {
    const userIdObj = new Types.ObjectId(userId);
    const existing = await this.profileModel
      .findOne({ userId: userIdObj })
      .lean()
      .exec();

    const updatedProfile = await this.profileModel
      .findOneAndUpdate(
        { userId: userIdObj },
        {
          $set: {
            ...updateProfileDto,
            displayName:
              updateProfileDto.displayName ??
              existing?.displayName ??
              'Mi espacio',
          },
        },
        { new: true, upsert: true },
      )
      .lean()
      .exec();

    if (!updatedProfile) throw new NotFoundException('Perfil no encontrado');
    return updatedProfile;
  }

  async completeOnboarding(userId: string): Promise<Profile | null> {
    const userIdObj = new Types.ObjectId(userId);
    return await this.profileModel
      .findOneAndUpdate(
        { userId: userIdObj },
        {
          $set: { 'onboardingData.completed': true, 'onboardingData.step': 3 },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  async addCheckIn(userId: string, dto: CreateCheckInDto) {
    const userIdObj = new Types.ObjectId(userId);
    return this.profileModel
      .findOneAndUpdate(
        { userId: userIdObj },
        {
          $setOnInsert: { userId: userIdObj, displayName: 'Mi espacio' },
          $push: {
            checkIns: {
              mood: dto.mood,
              energy: dto.energy ?? 'steady',
              note: dto.note ?? '',
              createdAt: new Date(),
            },
          },
        },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
  }

  async getCheckIns(userId: string) {
    const profile = await this.findByUserId(userId);
    return profile?.checkIns ?? [];
  }

  async getWeeklySummary(userId: string) {
    const profile = await this.findByUserId(userId);
    const [chats, reminders] = await Promise.all([
      this.chatsService.findAllByUser(userId),
      this.remindersService.findAllByUser(userId),
    ]);
    const checkIns = (profile?.checkIns ?? [])
      .filter((entry) => {
        const createdAt = new Date(entry.createdAt);
        return createdAt.getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000;
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    const moodCount = checkIns.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.mood] = (acc[entry.mood] ?? 0) + 1;
      return acc;
    }, {});

    const energyCount = checkIns.reduce<Record<string, number>>(
      (acc, entry) => {
        const key = entry.energy ?? 'steady';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {},
    );

    const sortedMoods = Object.entries(moodCount).sort((a, b) => b[1] - a[1]);
    const sortedEnergy = Object.entries(energyCount).sort(
      (a, b) => b[1] - a[1],
    );
    const uniqueDays = new Set(
      checkIns.map((entry) =>
        new Date(entry.createdAt).toISOString().slice(0, 10),
      ),
    );

    return {
      periodDays: 7,
      totalCheckIns: checkIns.length,
      selfCareDays: uniqueDays.size,
      conversationsThisWeek: chats.filter((chat) => {
        const when = new Date(chat.updatedAt ?? chat.createdAt ?? Date.now());
        return when.getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000;
      }).length,
      activeReminders: reminders.filter((reminder) => reminder.enabled).length,
      dominantMood: sortedMoods[0]?.[0] ?? null,
      dominantEnergy: sortedEnergy[0]?.[0] ?? null,
      moodBreakdown: sortedMoods.map(([label, value]) => ({ label, value })),
      energyBreakdown: sortedEnergy.map(([label, value]) => ({ label, value })),
      highlights:
        checkIns.length > 0
          ? [
              `Registraste ${checkIns.length} momento(s) de autocuidado esta semana.`,
              uniqueDays.size >= 3
                ? `Volviste a tu espacio en ${uniqueDays.size} dias distintos.`
                : 'Cada registro cuenta, incluso si fue un momento breve.',
            ]
          : [
              'Aun no hay check-ins esta semana. Puedes empezar con un registro breve hoy.',
            ],
      recentCheckIns: checkIns.slice(0, 5),
    };
  }
}
