import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { MarkUrgentNotificationsReadDto } from './dto/mark-urgent-notifications-read.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  async create(
    @Body() createMessageDto: CreateMessageDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.messagesService.create({
      ...createMessageDto,
      senderId: user.userId,
    });
  }

  @Get('notifications/urgent')
  async findUrgentNotifications(@CurrentUser() user: CurrentUserPayload) {
    return this.messagesService.findUrgentNotificationsForUser(user.userId);
  }

  @Post('notifications/urgent/read')
  async markUrgentNotificationsAsRead(
    @Body() payload: MarkUrgentNotificationsReadDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.messagesService.markUrgentNotificationsAsReadForUser(
      user.userId,
      payload.chatId,
    );
  }

  @Get('chat/:chatId')
  async findByChatId(
    @Param('chatId') chatId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.messagesService.findByChatIdForUser(chatId, user.userId);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.messagesService.findOneForUser(id, user.userId);
  }

  @Delete('chat/:chatId')
  async deleteByChatId(
    @Param('chatId') chatId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.messagesService.deleteByChatIdForUser(chatId, user.userId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateMessageDto: UpdateMessageDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.messagesService.updateForUser(id, user.userId, updateMessageDto);
  }
}
