import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { Chat } from '../chats/schemas/chat.schema';
import { Subscription } from '../subscriptions/schemas/subscription.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Chat.name) private chatModel: Model<Chat>,
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<Subscription>,
  ) {}

  async getDashboardMetrics() {
    const totalUsers = await this.userModel.countDocuments().exec();
    const activeUsers = await this.userModel
      .countDocuments({ isActive: true })
      .exec();
    const totalChats = await this.chatModel.countDocuments().exec();
    const premiumUsers = await this.subscriptionModel
      .countDocuments({ planCategory: 'premium', status: 'active' })
      .exec();

    const recentChats = await this.chatModel
      .find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('userId', 'email')
      .select('title userId createdAt messageCount')
      .lean()
      .exec();

    return {
      stats: {
        totalUsers,
        activeUsers,
        totalChats,
        premiumUsers,
      },
      recentChats: recentChats.map((chat) => ({
        id: chat._id,
        title: chat.title,
        userEmail: (chat.userId as any)?.email || 'N/A',
        createdAt: chat.createdAt,
        messageCount: chat.messageCount,
      })),
    };
  }

  async getAllUsers(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.userModel
        .find()
        .select('-passwordHash')
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.userModel.countDocuments().exec(),
    ]);

    return {
      data: users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserDetails(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-passwordHash')
      .lean()
      .exec();
    if (!user) return null;

    const subscription = await this.subscriptionModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean()
      .exec();
    const chatCount = await this.chatModel
      .countDocuments({ userId: new Types.ObjectId(userId) })
      .exec();

    return { ...user, subscription, chatCount };
  }

  async updateUserStatus(userId: string, status: boolean) {
    return this.userModel
      .findByIdAndUpdate(userId, { isActive: status }, { new: true })
      .select('-passwordHash')
      .exec();
  }

  async getRecentActivity(limit: number = 20) {
    const recentUsers = await this.userModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('email createdAt')
      .lean()
      .exec();
    const recentChats = await this.chatModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('title userId createdAt')
      .populate('userId', 'email')
      .lean()
      .exec();

    return { recentUsers, recentChats };
  }
}
