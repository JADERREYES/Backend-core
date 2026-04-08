import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post()
  async createSubscription(
    @Request() req,
    @Body() createSubscriptionDto: CreateSubscriptionDto,
  ) {
    const userId = req.user.userId;
    return this.subscriptionsService.create(userId, createSubscriptionDto);
  }

  @Get('me')
  async getMySubscription(@Request() req) {
    return this.subscriptionsService.findByUserId(req.user.userId);
  }

  @Put('me')
  async updateMySubscription(
    @Request() req,
    @Body() updateSubscriptionDto: UpdateSubscriptionDto,
  ) {
    return this.subscriptionsService.update(req.user.userId, updateSubscriptionDto);
  }

  @Get('me/usage')
  async getMyUsage(@Request() req) {
    return this.subscriptionsService.getUsage(req.user.userId);
  }

  @Get('me/history')
  async getMyActivationHistory(@Request() req) {
    return this.subscriptionsService.getActivationHistoryForUser(req.user.userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  async findAll() {
    return this.subscriptionsService.findAllForAdmin();
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  async updateById(
    @Param('id') id: string,
    @Body() updateSubscriptionDto: UpdateSubscriptionDto,
  ) {
    return this.subscriptionsService.updateById(id, updateSubscriptionDto);
  }

  @Get('admin/user/:userId/history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  async getActivationHistory(@Param('userId') userId: string) {
    return this.subscriptionsService.getActivationHistoryForUser(userId);
  }
}

@Controller('admin/user-subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class AdminUserSubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  async findAll() {
    return this.subscriptionsService.findAllForAdmin();
  }

  @Get(':userId')
  async findByUserId(@Param('userId') userId: string) {
    return this.subscriptionsService.findByUserIdForAdmin(userId);
  }

  @Patch(':id')
  async updateBySubscriptionId(
    @Param('id') id: string,
    @Body() updateSubscriptionDto: UpdateSubscriptionDto,
  ) {
    return this.subscriptionsService.updateById(id, updateSubscriptionDto);
  }
}
