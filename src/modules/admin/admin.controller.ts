import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  async getDashboard() {
    return await this.adminService.getDashboardMetrics();
  }

  @Get('users')
  async getUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return await this.adminService.getAllUsers(page, limit);
  }

  @Get('users/:userId')
  async getUserDetails(@Param('userId') userId: string) {
    return await this.adminService.getUserDetails(userId);
  }

  @Put('users/:userId/status')
  async updateUserStatus(
    @Param('userId') userId: string,
    @Body('status') status: boolean,
  ) {
    // Cambiado: status debe ser boolean, no string
    return await this.adminService.updateUserStatus(userId, status);
  }

  @Get('activity')
  async getRecentActivity(@Query('limit') limit: number = 20) {
    return await this.adminService.getRecentActivity(limit);
  }
}
