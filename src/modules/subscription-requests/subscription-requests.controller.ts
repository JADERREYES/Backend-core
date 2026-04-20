import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import {
  SubscriptionRequestsService,
  type SubscriptionRequestUploadFile,
} from './subscription-requests.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { CreateSubscriptionRequestDto } from './dto/create-subscription-request.dto';
import { UpdateSubscriptionRequestStatusDto } from './dto/update-subscription-request-status.dto';
import { UpdateSubscriptionRequestNotesDto } from './dto/update-subscription-request-notes.dto';
import { ActivateSubscriptionRequestDto } from './dto/activate-subscription-request.dto';

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf', '.webp'];
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

const proofUploadOptions = {
  storage: memoryStorage(),
  fileFilter: (
    _req: unknown,
    file: SubscriptionRequestUploadFile,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const extension = extname(file.originalname).toLowerCase();
    const validExtension = ALLOWED_EXTENSIONS.includes(extension);
    const validMime = ALLOWED_MIME_TYPES.includes(file.mimetype);

    if (!validExtension || !validMime) {
      return cb(
        new BadRequestException(
          'Solo se permiten comprobantes JPG, PNG, WEBP o PDF',
        ),
        false,
      );
    }

    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
};

@Controller('subscription-requests')
@UseGuards(JwtAuthGuard)
export class SubscriptionRequestsController {
  constructor(
    private readonly subscriptionRequestsService: SubscriptionRequestsService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('proof', proofUploadOptions))
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateSubscriptionRequestDto,
    @UploadedFile() file?: SubscriptionRequestUploadFile,
  ) {
    return this.subscriptionRequestsService.create(user.userId, dto, file);
  }

  @Get('me')
  async findMine(@CurrentUser() user: CurrentUserPayload) {
    return this.subscriptionRequestsService.findMine(user.userId);
  }

  @Get('me/:id')
  async findMineById(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.subscriptionRequestsService.findMineById(user.userId, id);
  }
}

@Controller('admin/subscription-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class AdminSubscriptionRequestsController {
  constructor(
    private readonly subscriptionRequestsService: SubscriptionRequestsService,
  ) {}

  @Get()
  async findAllForAdmin() {
    return this.subscriptionRequestsService.findAllForAdmin();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.subscriptionRequestsService.findByIdForAdmin(id);
  }

  @Get(':id/proof/download')
  async downloadProof(@Param('id') id: string, @Res() res: Response) {
    const proof =
      await this.subscriptionRequestsService.getProofFileForAdmin(id);

    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', proof.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(proof.fileName)}"`,
    );

    return res.send(proof.buffer);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateSubscriptionRequestStatusDto,
  ) {
    return this.subscriptionRequestsService.updateStatus(id, user.userId, dto);
  }

  @Patch(':id/notes')
  async updateNotes(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateSubscriptionRequestNotesDto,
  ) {
    return this.subscriptionRequestsService.updateNotes(id, user.userId, dto);
  }

  @Post(':id/activate')
  async activate(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ActivateSubscriptionRequestDto,
  ) {
    return this.subscriptionRequestsService.activate(id, user.userId, dto);
  }
}

@Controller('admin/user-subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class AdminUserSubscriptionActivationController {
  constructor(
    private readonly subscriptionRequestsService: SubscriptionRequestsService,
  ) {}

  @Post('activate-from-request/:requestId')
  async activateFromRequest(
    @Param('requestId') requestId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.subscriptionRequestsService.activate(
      requestId,
      user.userId,
      {},
    );
  }
}
