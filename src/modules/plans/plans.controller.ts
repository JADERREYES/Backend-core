import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { PlansService } from './plans.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { UpdatePlanStatusDto } from './dto/update-plan-status.dto';

@Controller('plans')
@UseGuards(JwtAuthGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get('active')
  async findActive() {
    return this.plansService.findActiveForUsers();
  }
}

@Controller('admin/plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class AdminPlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  async findAll() {
    return this.plansService.findAllForAdmin();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.plansService.findById(id);
  }

  @Post()
  async create(@Body() dto: CreatePlanDto) {
    return this.plansService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(id, dto);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdatePlanStatusDto) {
    return this.plansService.updateStatus(id, dto.isActive);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.plansService.remove(id);
  }
}
