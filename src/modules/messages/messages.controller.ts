import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  async create(@Body() createMessageDto: CreateMessageDto) {
    // Eliminado el parámetro userId - solo necesita createMessageDto
    return this.messagesService.create(createMessageDto);
  }

  @Get('chat/:chatId')
  async findByChatId(@Param('chatId') chatId: string) {
    // Cambiado de findAllByChat a findByChatId
    // Eliminado userId - no es necesario en el service
    return this.messagesService.findByChatId(chatId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    // Eliminado userId - solo necesita id
    return this.messagesService.findOne(id);
  }

  @Delete('chat/:chatId')
  async deleteByChatId(@Param('chatId') chatId: string) {
    // Cambiado de deleteAllByChat a deleteByChatId
    // Eliminado userId - no es necesario en el service
    return this.messagesService.deleteByChatId(chatId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateMessageDto: UpdateMessageDto,
  ) {
    return this.messagesService.update(id, updateMessageDto);
  }
}
