import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ChatsService } from './chats.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() createChatDto: CreateChatDto,
  ) {
    return this.chatsService.create(user.userId, createChatDto);
  }

  @Get()
  async findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.chatsService.findAllByUser(user.userId);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.chatsService.findOne(id, user.userId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() updateChatDto: UpdateChatDto,
  ) {
    return this.chatsService.update(id, user.userId, updateChatDto);
  }

  @Put(':id/archive')
  async archive(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.chatsService.archive(id, user.userId);
  }

  @Put(':id/pin')
  async pin(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.chatsService.pin(id, user.userId);
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.chatsService.delete(id, user.userId);
  }
}
