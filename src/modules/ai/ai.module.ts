import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { DocumentsModule } from '../documents/documents.module';
import { ChatsModule } from '../chats/chats.module';
import { MessagesModule } from '../messages/messages.module';
import { AlertsModule } from '../alerts/alerts.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { UserMemory, UserMemorySchema } from './schemas/user-memory.schema';
import { UserMemoriesService } from './user-memories.service';

@Module({
  imports: [
    DocumentsModule,
    ChatsModule,
    MessagesModule,
    AlertsModule,
    ProfilesModule,
    MongooseModule.forFeature([
      { name: UserMemory.name, schema: UserMemorySchema },
    ]),
  ],
  providers: [AiService, UserMemoriesService],
  controllers: [AiController],
  exports: [AiService, UserMemoriesService],
})
export class AiModule {}
