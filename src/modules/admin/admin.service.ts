import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { Chat } from '../chats/schemas/chat.schema';
import { Subscription } from '../subscriptions/schemas/subscription.schema';
import { AdminDocument } from '../documents/schemas/document.schema';
import { SubscriptionRequest } from '../subscription-requests/schemas/subscription-request.schema';
import { Alert } from '../alerts/schemas/alert.schema';
import {
  TEST_EMAIL_QUERY_REGEX,
  TEST_KEYWORD_QUERY_REGEX,
  isTestChatRecord,
  isTestDocumentRecord,
  isTestSubscriptionRequestRecord,
  isTestUserRecord,
} from '../../common/test-data/test-data.utils';

const pendingSubscriptionRequestStatuses = [
  'new',
  'receipt_uploaded',
  'submitted',
  'under_review',
  'contacted',
  'pending_payment',
  'paid',
  'awaiting_validation',
];

type RecentChat = {
  _id: Types.ObjectId;
  title?: string;
  userId?: { email?: string } | Types.ObjectId | null;
  createdAt?: Date;
  messageCount?: number;
};

type RecentUser = {
  _id: Types.ObjectId;
  email?: string;
  name?: string;
  phone?: string;
  createdAt?: Date;
};

type RecentRequest = {
  _id: Types.ObjectId;
  userEmail?: string;
  userName?: string;
  planName?: string;
  planCode?: string;
  status?: string;
  createdAt?: Date;
  paidAtReference?: string;
  proofOriginalName?: string;
  receiptFileName?: string;
};

type RecentDocument = {
  _id: Types.ObjectId;
  title?: string;
  originalFileName?: string;
  storedFileName?: string;
  author?: string;
  updatedAt?: Date;
  indexingStatus?: string;
  processingStatus?: string;
};

const getPopulatedEmail = (userId: RecentChat['userId']) =>
  typeof userId === 'object' && userId !== null && 'email' in userId
    ? userId.email || 'N/A'
    : 'N/A';

const buildTestUserQuery = () => ({
  $or: [
    { email: { $regex: TEST_EMAIL_QUERY_REGEX } },
    { name: { $regex: TEST_KEYWORD_QUERY_REGEX } },
    { phone: { $regex: TEST_KEYWORD_QUERY_REGEX } },
  ],
});

const buildTestDocumentFilter = () => ({
  $nor: [
    { title: { $regex: TEST_KEYWORD_QUERY_REGEX } },
    { originalFileName: { $regex: TEST_KEYWORD_QUERY_REGEX } },
    { storedFileName: { $regex: TEST_KEYWORD_QUERY_REGEX } },
    { author: { $regex: TEST_KEYWORD_QUERY_REGEX } },
  ],
});

const buildTestSubscriptionRequestFilter = (testUserIds: Types.ObjectId[]) => ({
  $nor: [
    ...(testUserIds.length ? [{ userId: { $in: testUserIds } }] : []),
    { userEmail: { $regex: TEST_EMAIL_QUERY_REGEX } },
    { userName: { $regex: TEST_KEYWORD_QUERY_REGEX } },
    { planCode: { $regex: TEST_KEYWORD_QUERY_REGEX } },
    { planName: { $regex: TEST_KEYWORD_QUERY_REGEX } },
    { paidAtReference: { $regex: TEST_KEYWORD_QUERY_REGEX } },
    { proofOriginalName: { $regex: TEST_KEYWORD_QUERY_REGEX } },
    { receiptFileName: { $regex: TEST_KEYWORD_QUERY_REGEX } },
  ],
});

const buildTestChatFilter = (testUserIds: Types.ObjectId[]) => ({
  $nor: [
    ...(testUserIds.length ? [{ userId: { $in: testUserIds } }] : []),
    { title: { $regex: TEST_KEYWORD_QUERY_REGEX } },
  ],
});

const buildPrivateChatLabel = (chatId: string) =>
  `chat-${chatId.slice(-6).toLowerCase()}`;

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Chat.name) private chatModel: Model<Chat>,
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<Subscription>,
    @InjectModel(AdminDocument.name)
    private adminDocumentModel: Model<AdminDocument>,
    @InjectModel(SubscriptionRequest.name)
    private subscriptionRequestModel: Model<SubscriptionRequest>,
    @InjectModel(Alert.name) private alertModel: Model<Alert>,
  ) {}

  async getDashboardMetrics() {
    const testUsers = await this.userModel
      .find(buildTestUserQuery())
      .select('_id email name phone')
      .lean()
      .exec();
    const testUserIds = (testUsers || []).map(
      (user) => new Types.ObjectId(String(user._id)),
    );

    const chatFilter = buildTestChatFilter(testUserIds);
    const requestFilter = buildTestSubscriptionRequestFilter(testUserIds);
    const documentFilter = buildTestDocumentFilter();

    const [
      totalUsers,
      activeUsers,
      totalChats,
      premiumUsers,
      pendingSubscriptionRequests,
      totalDocuments,
      processedDocuments,
      failedDocuments,
      openAlerts,
      recentChats,
      recentUsers,
      recentRequests,
      recentDocuments,
    ] = await Promise.all([
      this.userModel.countDocuments({ _id: { $nin: testUserIds } }).exec(),
      this.userModel
        .countDocuments({ _id: { $nin: testUserIds }, isActive: true })
        .exec(),
      this.chatModel.countDocuments(chatFilter).exec(),
      this.subscriptionModel
        .countDocuments({
          ...(testUserIds.length ? { userId: { $nin: testUserIds } } : {}),
          planCategory: 'premium',
          status: 'active',
        })
        .exec(),
      this.subscriptionRequestModel
        .countDocuments({
          ...requestFilter,
          status: { $in: pendingSubscriptionRequestStatuses },
        })
        .exec(),
      this.adminDocumentModel.countDocuments(documentFilter).exec(),
      this.adminDocumentModel
        .countDocuments({
          ...documentFilter,
          processingStatus: { $in: ['processed', 'indexed'] },
          indexingStatus: 'completed',
        })
        .exec(),
      this.adminDocumentModel
        .countDocuments({
          ...documentFilter,
          $or: [{ processingStatus: 'failed' }, { extractionStatus: 'failed' }],
        })
        .exec(),
      this.alertModel.countDocuments({ status: { $ne: 'resolved' } }).exec(),
      this.chatModel
        .find(chatFilter)
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('userId', 'email')
        .select('userId createdAt messageCount')
        .lean()
        .exec(),
      this.userModel
        .find({ _id: { $nin: testUserIds } })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('email name phone createdAt')
        .lean()
        .exec(),
      this.subscriptionRequestModel
        .find(requestFilter)
        .sort({ createdAt: -1 })
        .limit(5)
        .select(
          'userEmail userName planName planCode status createdAt paidAtReference proofOriginalName receiptFileName',
        )
        .lean()
        .exec(),
      this.adminDocumentModel
        .find(documentFilter)
        .sort({ updatedAt: -1 })
        .limit(5)
        .select(
          'title originalFileName storedFileName author processingStatus indexingStatus updatedAt',
        )
        .lean()
        .exec(),
    ]);

    return {
      period: {
        label: 'Estado actual',
        generatedAt: new Date().toISOString(),
      },
      stats: {
        totalUsers,
        activeUsers,
        totalChats,
        premiumUsers,
        pendingSubscriptionRequests,
        totalDocuments,
        processedDocuments,
        failedDocuments,
        openAlerts,
        humanReviewCases: openAlerts,
      },
      recentChats: (recentChats as RecentChat[])
        .map((chat) => ({
          id: String(chat._id),
          title: buildPrivateChatLabel(String(chat._id)),
          userEmail: getPopulatedEmail(chat.userId),
          createdAt: chat.createdAt,
          messageCount: chat.messageCount,
        }))
        .filter((chat) => !isTestChatRecord(chat)),
      recentActivity: [
        ...(recentUsers as RecentUser[])
          .filter((user) => !isTestUserRecord(user))
          .map((user) => ({
            id: `user-${String(user._id)}`,
            type: 'user',
            title: 'Nuevo usuario',
            subtitle: user.email || user.name || 'Usuario',
            timestamp: user.createdAt,
            status: 'registro',
          })),
        ...(recentRequests as RecentRequest[])
          .filter((request) => !isTestSubscriptionRequestRecord(request))
          .map((request) => ({
            id: `request-${String(request._id)}`,
            type: 'subscriptionRequest',
            title: 'Solicitud premium',
            subtitle: `${request.userEmail || 'Usuario'} · ${request.planName || 'Plan'}`,
            timestamp: request.createdAt,
            status: request.status,
          })),
        ...(recentDocuments as RecentDocument[])
          .filter((document) => !isTestDocumentRecord(document))
          .map((document) => ({
            id: `document-${String(document._id)}`,
            type: 'document',
            title: 'Documento actualizado',
            subtitle: document.title || 'Documento interno',
            timestamp: document.updatedAt,
            status: document.indexingStatus || document.processingStatus,
          })),
      ].sort((left, right) => {
        const leftTime = new Date(left.timestamp || 0).getTime();
        const rightTime = new Date(right.timestamp || 0).getTime();
        return rightTime - leftTime;
      }),
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
    const testUsers = await this.userModel
      .find(buildTestUserQuery())
      .select('_id')
      .lean()
      .exec();
    const testUserIds = (testUsers || []).map(
      (user) => new Types.ObjectId(String(user._id)),
    );

    const recentUsers = await this.userModel
      .find({ _id: { $nin: testUserIds } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('email createdAt')
      .lean()
      .exec();
    const recentChats = await this.chatModel
      .find(buildTestChatFilter(testUserIds))
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('userId createdAt')
      .populate('userId', 'email')
      .lean()
      .exec();

    return {
      recentUsers,
      recentChats: (recentChats as RecentChat[]).map((chat) => ({
        _id: chat._id,
        title: buildPrivateChatLabel(String(chat._id)),
        userId: chat.userId,
        createdAt: chat.createdAt,
      })),
    };
  }
}
