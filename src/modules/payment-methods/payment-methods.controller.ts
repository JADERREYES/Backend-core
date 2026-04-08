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
import { PaymentMethodsService } from './payment-methods.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { UpdatePaymentMethodStatusDto } from './dto/update-payment-method-status.dto';

@Controller('payment-methods')
@UseGuards(JwtAuthGuard)
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Get('active')
  async findActive() {
    return this.paymentMethodsService.findActiveForUsers();
  }
}

@Controller('admin/payment-methods')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class AdminPaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Get()
  async findAll() {
    return this.paymentMethodsService.findAllForAdmin();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.paymentMethodsService.findById(id);
  }

  @Post()
  async create(@Body() dto: CreatePaymentMethodDto) {
    return this.paymentMethodsService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePaymentMethodDto) {
    return this.paymentMethodsService.update(id, dto);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentMethodStatusDto,
  ) {
    return this.paymentMethodsService.updateStatus(id, dto.isActive);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.paymentMethodsService.remove(id);
  }
}
