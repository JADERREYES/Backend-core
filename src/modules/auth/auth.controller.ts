import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';
import {
  ConfirmTwoFactorDto,
  DisableTwoFactorDto,
  RequestTwoFactorDto,
} from './dto/two-factor.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.getProfile(user.userId);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.userId, dto);
  }

  @Post('email-change/request')
  @UseGuards(JwtAuthGuard)
  async requestEmailChange(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RequestEmailChangeDto,
  ) {
    return this.authService.requestEmailChange(user.userId, dto);
  }

  @Post('email-change/confirm')
  @UseGuards(JwtAuthGuard)
  async confirmEmailChange(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ConfirmEmailChangeDto,
  ) {
    return this.authService.confirmEmailChange(user.userId, dto);
  }

  @Post('2fa/request')
  @UseGuards(JwtAuthGuard)
  async requestTwoFactor(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RequestTwoFactorDto,
  ) {
    return this.authService.requestTwoFactorSetup(user.userId, dto);
  }

  @Post('2fa/confirm')
  @UseGuards(JwtAuthGuard)
  async confirmTwoFactor(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ConfirmTwoFactorDto,
  ) {
    return this.authService.confirmTwoFactorSetup(user.userId, dto);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  async disableTwoFactor(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: DisableTwoFactorDto,
  ) {
    return this.authService.disableTwoFactor(user.userId, dto);
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  async deleteAccount(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.deleteAccount(user.userId);
  }
}
