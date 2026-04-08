import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';

@Controller('reminders')
@UseGuards(JwtAuthGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get()
  async findAll(@Request() req) {
    return this.remindersService.findAllByUser(req.user.userId);
  }

  @Post()
  async create(@Request() req, @Body() dto: CreateReminderDto) {
    return this.remindersService.create(req.user.userId, dto);
  }

  @Put(':id')
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateReminderDto) {
    return this.remindersService.update(req.user.userId, id, dto);
  }

  @Delete(':id')
  async remove(@Request() req, @Param('id') id: string) {
    return this.remindersService.remove(req.user.userId, id);
  }
}
