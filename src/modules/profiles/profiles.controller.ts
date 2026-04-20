import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  UseGuards,
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
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';

type UploadedAvatarFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

type AvatarProfileUpdate = UpdateProfileDto & {
  avatarStorageProvider?: string;
  avatarStorageKey?: string;
  avatarFileName?: string;
  avatarMimeType?: string;
  avatarSize?: number;
};

@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly storageService: StorageService,
  ) {}

  @Post()
  async createProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Body() createProfileDto: CreateProfileDto,
  ) {
    return this.profilesService.create(user.userId, createProfileDto);
  }

  @Get('me')
  async getMyProfile(@CurrentUser() user: CurrentUserPayload) {
    return this.profilesService.findByUserId(user.userId);
  }

  @Put('me')
  async updateMyProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.profilesService.update(user.userId, updateProfileDto);
  }

  @Post('me/complete-onboarding')
  async completeOnboarding(@CurrentUser() user: CurrentUserPayload) {
    return this.profilesService.completeOnboarding(user.userId);
  }

  @Get('me/check-ins')
  async getCheckIns(@CurrentUser() user: CurrentUserPayload) {
    return this.profilesService.getCheckIns(user.userId);
  }

  @Post('me/check-ins')
  async createCheckIn(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateCheckInDto,
  ) {
    return this.profilesService.addCheckIn(user.userId, dto);
  }

  @Get('me/weekly-summary')
  async getWeeklySummary(@CurrentUser() user: CurrentUserPayload) {
    return this.profilesService.getWeeklySummary(user.userId);
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/png', 'image/jpeg', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              'Solo se permiten imagenes PNG, JPG o WEBP',
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file?: UploadedAvatarFile,
  ) {
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

    const updatePayload: AvatarProfileUpdate = {
      avatarUrl: storedAvatar.fileUrl,
      avatarStorageProvider: storedAvatar.provider,
      avatarStorageKey: storedAvatar.key,
      avatarFileName: storedAvatar.fileName,
      avatarMimeType: storedAvatar.mimeType,
      avatarSize: storedAvatar.size,
    };

    return this.profilesService.update(user.userId, updatePayload);
  }
}
