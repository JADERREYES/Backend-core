import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SupportRequestsService } from './support-requests.service';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@Controller('support-requests')
@UseGuards(JwtAuthGuard)
export class SupportRequestsController {
  constructor(
    private readonly supportRequestsService: SupportRequestsService,
  ) {}

  @Get('me')
  async findMine(@CurrentUser() user: CurrentUserPayload) {
    return this.supportRequestsService.findAllByUser(user.userId);
  }

  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateSupportRequestDto,
  ) {
    return this.supportRequestsService.create(user.userId, dto);
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  async findAllForAdmin() {
    return this.supportRequestsService.findAllForAdmin();
  }
}
