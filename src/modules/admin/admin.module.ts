import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import {
  Subscription,
  SubscriptionSchema,
} from '../subscriptions/schemas/subscription.schema';
import { Chat, ChatSchema } from '../chats/schemas/chat.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  AdminDocument,
  AdminDocumentSchema,
} from '../documents/schemas/document.schema';
import {
  SubscriptionRequest,
  SubscriptionRequestSchema,
} from '../subscription-requests/schemas/subscription-request.schema';
import { Alert, AlertSchema } from '../alerts/schemas/alert.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Chat.name, schema: ChatSchema },
      { name: AdminDocument.name, schema: AdminDocumentSchema },
      { name: SubscriptionRequest.name, schema: SubscriptionRequestSchema },
      { name: Alert.name, schema: AlertSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
