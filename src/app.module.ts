import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { ChatsModule } from './modules/chats/chats.module';
import { MessagesModule } from './modules/messages/messages.module';
import { AiModule } from './modules/ai/ai.module';
import { AdminModule } from './modules/admin/admin.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { SettingsModule } from './modules/settings/settings.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { SupportRequestsModule } from './modules/support-requests/support-requests.module';
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';
import { PlansModule } from './modules/plans/plans.module';
import { SubscriptionRequestsModule } from './modules/subscription-requests/subscription-requests.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const uri = configService.get<string>('MONGODB_URI');
        const dbName = configService.get<string>('MONGODB_DB_NAME');

        if (!uri) {
          throw new Error('MONGODB_URI is not defined in environment variables');
        }

        if (!dbName) {
          throw new Error(
            'MONGODB_DB_NAME is not defined in environment variables',
          );
        }

        return {
          uri,
          dbName,
        };
      },
      inject: [ConfigService],
    }),
    UsersModule,
    AuthModule,
    ProfilesModule,
    SubscriptionsModule,
    ChatsModule,
    MessagesModule,
    AiModule,
    AdminModule,
    AlertsModule,
    DocumentsModule,
    SettingsModule,
    RemindersModule,
    SupportRequestsModule,
    PaymentMethodsModule,
    PlansModule,
    SubscriptionRequestsModule,
  ],
})
export class AppModule {}
