import { Body, Controller, Get, Patch, Param, Post, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { UpdateAlertStatusDto } from './dto/update-alert-status.dto';
import { SendAlertCrisisResponseDto } from './dto/send-alert-crisis-response.dto';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';

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

  @Post(':id/send-crisis-support')
  async sendCrisisSupport(
    @Param('id') id: string,
    @Body() payload: SendAlertCrisisResponseDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.alertsService.sendCrisisSupportMessage(
      id,
      user.userId,
      payload.message,
    );
  }
}
