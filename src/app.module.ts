import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
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
import { validateEnv } from './config/env.validation';
import { createMongooseOptions } from './config/mongodb.config';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: createMongooseOptions,
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: Number(configService.get<string>('THROTTLE_TTL_MS') || 60000),
          limit: Number(configService.get<string>('THROTTLE_LIMIT') || 120),
        },
      ],
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
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
