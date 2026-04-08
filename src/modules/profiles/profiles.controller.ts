import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateCheckInDto } from './dto/create-checkin.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { StorageService } from '../../common/storage/storage.service';

@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly storageService: StorageService,
  ) {}

  @Post()
  async createProfile(
    @Request() req,
    @Body() createProfileDto: CreateProfileDto,
  ) {
    const userId = req.user.userId;
    return this.profilesService.create(userId, createProfileDto);
  }

  @Get('me')
  async getMyProfile(@Request() req) {
    const userId = req.user.userId;
    return this.profilesService.findByUserId(userId);
  }

  @Put('me')
  async updateMyProfile(
    @Request() req,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    const userId = req.user.userId;
    return this.profilesService.update(userId, updateProfileDto);
  }

  @Post('me/complete-onboarding')
  async completeOnboarding(@Request() req) {
    const userId = req.user.userId;
    return this.profilesService.completeOnboarding(userId);
  }

  @Get('me/check-ins')
  async getCheckIns(@Request() req) {
    return this.profilesService.getCheckIns(req.user.userId);
  }

  @Post('me/check-ins')
  async createCheckIn(@Request() req, @Body() dto: CreateCheckInDto) {
    return this.profilesService.addCheckIn(req.user.userId, dto);
  }

  @Get('me/weekly-summary')
  async getWeeklySummary(@Request() req) {
    return this.profilesService.getWeeklySummary(req.user.userId);
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/png', 'image/jpeg', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
          return cb(new BadRequestException('Solo se permiten imagenes PNG, JPG o WEBP'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadAvatar(@Request() req, @UploadedFile() file?: any) {
    if (!file) {
      throw new BadRequestException('No se recibio ningun avatar');
    }

    const storedAvatar = await this.storageService.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      folder: 'avatars',
      resourceType: 'image',
    });

    return this.profilesService.update(req.user.userId, {
      avatarUrl: storedAvatar.fileUrl,
      avatarStorageProvider: storedAvatar.provider,
      avatarStorageKey: storedAvatar.key,
      avatarFileName: storedAvatar.fileName,
      avatarMimeType: storedAvatar.mimeType,
      avatarSize: storedAvatar.size,
    } as any);
  }
}
