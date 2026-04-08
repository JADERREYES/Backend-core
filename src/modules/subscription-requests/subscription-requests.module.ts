import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdminSubscriptionRequestsController,
  AdminUserSubscriptionActivationController,
  SubscriptionRequestsController,
} from './subscription-requests.controller';
import { SubscriptionRequestsService } from './subscription-requests.service';
import {
  SubscriptionRequest,
  SubscriptionRequestSchema,
} from './schemas/subscription-request.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PlansModule } from '../plans/plans.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { StorageModule } from '../../common/storage/storage.module';

@Module({
  imports: [
    StorageModule,
    PlansModule,
    PaymentMethodsModule,
    SubscriptionsModule,
    MongooseModule.forFeature([
      { name: SubscriptionRequest.name, schema: SubscriptionRequestSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [
    SubscriptionRequestsController,
    AdminSubscriptionRequestsController,
    AdminUserSubscriptionActivationController,
  ],
  providers: [SubscriptionRequestsService],
  exports: [SubscriptionRequestsService],
})
export class SubscriptionRequestsModule {}
