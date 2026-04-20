import { PartialType } from '@nestjs/mapped-types';
import { CreateChatDto } from './create-chat.dto';
import { ChatStatus } from '../schemas/chat.schema';

export class UpdateChatDto extends PartialType(CreateChatDto) {
  status?: ChatStatus;
}
