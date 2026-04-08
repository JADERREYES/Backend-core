import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ChatsService } from './chats.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Post()
  async create(@Request() req, @Body() createChatDto: CreateChatDto) {
    const userId = req.user.userId;
    return this.chatsService.create(userId, createChatDto);
  }

  @Get()
  async findAll(@Request() req) {
    const userId = req.user.userId;
    return this.chatsService.findAllByUser(userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    const userId = req.user.userId;
    return this.chatsService.findOne(id, userId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Request() req,
    @Body() updateChatDto: UpdateChatDto,
  ) {
    const userId = req.user.userId;
    return this.chatsService.update(id, userId, updateChatDto);
  }

  @Put(':id/archive')
  async archive(@Param('id') id: string, @Request() req) {
    const userId = req.user.userId;
    return this.chatsService.archive(id, userId);
  }

  @Put(':id/pin')
  async pin(@Param('id') id: string, @Request() req) {
    const userId = req.user.userId;
    return this.chatsService.pin(id, userId);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req) {
    const userId = req.user.userId;
    return this.chatsService.delete(id, userId);
  }
}
