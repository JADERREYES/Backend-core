import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { DocumentsModule } from '../documents/documents.module';
import { ChatsModule } from '../chats/chats.module';
import { MessagesModule } from '../messages/messages.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [DocumentsModule, ChatsModule, MessagesModule, AlertsModule],
  providers: [AiService],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
