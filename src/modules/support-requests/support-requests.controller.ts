import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SupportRequestsService } from './support-requests.service';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('support-requests')
@UseGuards(JwtAuthGuard)
export class SupportRequestsController {
  constructor(private readonly supportRequestsService: SupportRequestsService) {}

  @Get('me')
  async findMine(@Request() req) {
    return this.supportRequestsService.findAllByUser(req.user.userId);
  }

  @Post()
  async create(@Request() req, @Body() dto: CreateSupportRequestDto) {
    return this.supportRequestsService.create(req.user.userId, dto);
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  async findAllForAdmin() {
    return this.supportRequestsService.findAllForAdmin();
  }
}
