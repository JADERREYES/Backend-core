import { Body, Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { UpdateAlertStatusDto } from './dto/update-alert-status.dto';

@Controller('alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  async findAll() {
    return this.alertsService.findAll();
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() payload: UpdateAlertStatusDto,
  ) {
    return this.alertsService.updateStatus(id, payload.status);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() payload: UpdateAlertDto) {
    return this.alertsService.update(id, payload);
  }
}
