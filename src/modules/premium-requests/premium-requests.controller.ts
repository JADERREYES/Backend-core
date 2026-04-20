import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PremiumRequestsService } from './premium-requests.service';
import { CreatePremiumRequestDto } from './dto/create-premium-request.dto';
import { UpdatePremiumRequestStatusDto } from './dto/update-premium-request-status.dto';
import { UpdatePremiumRequestNotesDto } from './dto/update-premium-request-notes.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

@Controller('premium-requests')
@UseGuards(JwtAuthGuard)
export class PremiumRequestsController {
  constructor(
    private readonly premiumRequestsService: PremiumRequestsService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreatePremiumRequestDto,
  ) {
    return this.premiumRequestsService.create(user.userId, dto);
  }

  @Get('me')
  async findMine(@CurrentUser() user: CurrentUserPayload) {
    return this.premiumRequestsService.findMine(user.userId);
  }
}

@Controller('admin/premium-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class AdminPremiumRequestsController {
  constructor(
    private readonly premiumRequestsService: PremiumRequestsService,
  ) {}

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
