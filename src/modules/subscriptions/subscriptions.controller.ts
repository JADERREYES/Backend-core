import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post()
  async createSubscription(
    @CurrentUser() user: CurrentUserPayload,
    @Body() createSubscriptionDto: CreateSubscriptionDto,
  ) {
    return this.subscriptionsService.create(user.userId, createSubscriptionDto);
  }

  @Get('me')
  async getMySubscription(@CurrentUser() user: CurrentUserPayload) {
    return this.subscriptionsService.findByUserId(user.userId);
  }

  @Put('me')
  async updateMySubscription(
    @CurrentUser() user: CurrentUserPayload,
    @Body() updateSubscriptionDto: UpdateSubscriptionDto,
  ) {
    return this.subscriptionsService.update(user.userId, updateSubscriptionDto);
  }

  @Get('me/usage')
  async getMyUsage(@CurrentUser() user: CurrentUserPayload) {
    return this.subscriptionsService.getUsage(user.userId);
  }

  @Get('me/history')
  async getMyActivationHistory(@CurrentUser() user: CurrentUserPayload) {
    return this.subscriptionsService.getActivationHistoryForUser(user.userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.subscriptionsService.findAllForAdminPaginated({
      page,
      limit,
      search,
      status,
    });
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
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.subscriptionsService.findAllForAdminPaginated({
      page,
      limit,
      search,
      status,
    });
  }

  @Get(':id')
  async findByUserOrSubscriptionId(@Param('id') id: string) {
    return this.subscriptionsService.findByUserOrSubscriptionIdForAdmin(id);
  }

  @Patch(':id')
  async updateBySubscriptionId(
    @Param('id') id: string,
    @Body() updateSubscriptionDto: UpdateSubscriptionDto,
  ) {
    return this.subscriptionsService.updateById(id, updateSubscriptionDto);
  }
}
