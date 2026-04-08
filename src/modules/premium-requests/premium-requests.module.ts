import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdminPremiumRequestsController,
  PremiumRequestsController,
} from './premium-requests.controller';
import { PremiumRequestsService } from './premium-requests.service';
import {
  PremiumRequest,
  PremiumRequestSchema,
} from './schemas/premium-request.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  Subscription,
  SubscriptionSchema,
} from '../subscriptions/schemas/subscription.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PremiumRequest.name, schema: PremiumRequestSchema },
      { name: User.name, schema: UserSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
  ],
  controllers: [PremiumRequestsController, AdminPremiumRequestsController],
  providers: [PremiumRequestsService],
  exports: [PremiumRequestsService],
})
export class PremiumRequestsModule {}
