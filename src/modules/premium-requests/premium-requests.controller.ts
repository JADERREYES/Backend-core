import { Body, Controller, Get, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { PremiumRequestsService } from './premium-requests.service';
import { CreatePremiumRequestDto } from './dto/create-premium-request.dto';
import { UpdatePremiumRequestStatusDto } from './dto/update-premium-request-status.dto';
import { UpdatePremiumRequestNotesDto } from './dto/update-premium-request-notes.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Param } from '@nestjs/common';

@Controller('premium-requests')
@UseGuards(JwtAuthGuard)
export class PremiumRequestsController {
  constructor(private readonly premiumRequestsService: PremiumRequestsService) {}

  @Post()
  async create(@Request() req, @Body() dto: CreatePremiumRequestDto) {
    return this.premiumRequestsService.create(req.user.userId, dto);
  }

  @Get('me')
  async findMine(@Request() req) {
    return this.premiumRequestsService.findMine(req.user.userId);
  }
}

@Controller('admin/premium-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class AdminPremiumRequestsController {
  constructor(private readonly premiumRequestsService: PremiumRequestsService) {}

  @Get()
  async findAllForAdmin() {
    return this.premiumRequestsService.findAllForAdmin();
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePremiumRequestStatusDto,
  ) {
    return this.premiumRequestsService.updateStatus(id, dto);
  }

  @Patch(':id/notes')
  async updateNotes(
    @Param('id') id: string,
    @Body() dto: UpdatePremiumRequestNotesDto,
  ) {
    return this.premiumRequestsService.updateNotes(id, dto);
  }
}
