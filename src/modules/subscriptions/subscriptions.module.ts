import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { AdminUserSubscriptionsController } from './subscriptions.controller';
import {
  Subscription,
  SubscriptionSchema,
} from './schemas/subscription.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PlansModule } from '../plans/plans.module';
import {
  SubscriptionActivation,
  SubscriptionActivationSchema,
} from './schemas/subscription-activation.schema';

@Module({
  imports: [
    PlansModule,
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      {
        name: SubscriptionActivation.name,
        schema: SubscriptionActivationSchema,
      },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [SubscriptionsController, AdminUserSubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
