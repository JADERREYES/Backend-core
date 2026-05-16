import {
  Controller,
  Delete,
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
import { extname } from 'path';
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

const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];
const ALLOWED_AVATAR_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

const normalizeAvatarExtension = (extension: string) =>
  extension === '.jpeg' ? '.jpg' : extension;

const hasValidAvatarSignature = (buffer: Buffer, extension: string) => {
  if (!buffer?.length) {
    return false;
  }

  const normalizedExtension = normalizeAvatarExtension(extension);

  if (
    normalizedExtension === '.png' &&
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return true;
  }

  if (
    normalizedExtension === '.jpg' &&
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  ) {
    return true;
  }

  if (
    normalizedExtension === '.webp' &&
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return true;
  }

  return false;
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
        const extension = extname(file.originalname || '').toLowerCase();
        const validMime = ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype);
        const validExtension = ALLOWED_AVATAR_EXTENSIONS.includes(extension);

        if (!validMime || !validExtension) {
          return cb(
            new BadRequestException(
              'Solo se permiten imagenes PNG, JPG o WEBP',
            ),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: AVATAR_MAX_SIZE_BYTES },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file?: UploadedAvatarFile,
  ) {
    if (!file) {
      throw new BadRequestException('No se recibio ningun avatar');
    }

    const extension = extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_AVATAR_EXTENSIONS.includes(extension)) {
      throw new BadRequestException(
        'La extension del avatar no es valida. Usa PNG, JPG o WEBP.',
      );
    }

    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'El tipo de archivo no es valido. Usa PNG, JPG o WEBP.',
      );
    }

    if (file.size > AVATAR_MAX_SIZE_BYTES) {
      throw new BadRequestException('El avatar supera el tamano maximo de 5 MB');
    }

    if (!hasValidAvatarSignature(file.buffer, extension)) {
      throw new BadRequestException(
        'El archivo no coincide con una imagen PNG, JPG o WEBP valida.',
      );
    }

    const currentProfile = await this.profilesService.findByUserId(user.userId);
    const safeExtension = normalizeAvatarExtension(extension);
    const safeAvatarBaseName = `avatar-${user.userId}-${Date.now()}`;

    const storedAvatar = await this.storageService.upload({
      buffer: file.buffer,
      originalName: `${safeAvatarBaseName}${safeExtension}`,
      mimeType: file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype,
      folder: 'avatars',
      resourceType: 'image',
      targetBaseName: safeAvatarBaseName,
    });

    const updatePayload: AvatarProfileUpdate = {
      avatarUrl: storedAvatar.fileUrl,
      avatarStorageProvider: storedAvatar.provider,
      avatarStorageKey: storedAvatar.key,
      avatarFileName: storedAvatar.fileName,
      avatarMimeType: storedAvatar.mimeType,
      avatarSize: storedAvatar.size,
    };

    const updatedProfile = await this.profilesService.update(
      user.userId,
      updatePayload,
    );

    if (
      currentProfile?.avatarStorageKey &&
      currentProfile.avatarStorageKey !== storedAvatar.key
    ) {
      await this.storageService
        .delete(currentProfile.avatarStorageKey)
        .catch(() => undefined);
    }

    return updatedProfile;
  }

  @Delete('me/avatar')
  async deleteAvatar(@CurrentUser() user: CurrentUserPayload) {
    const currentProfile = await this.profilesService.findByUserId(user.userId);

    if (currentProfile?.avatarStorageKey) {
      await this.storageService
        .delete(currentProfile.avatarStorageKey)
        .catch(() => undefined);
    }

    return this.profilesService.update(user.userId, {
      avatarUrl: '',
      avatarStorageProvider: '',
      avatarStorageKey: '',
      avatarFileName: '',
      avatarMimeType: '',
      avatarSize: 0,
    } as AvatarProfileUpdate);
  }
}
