import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { SubscriptionRequestsService } from './subscription-requests.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
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
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      const uploadDir = join(process.cwd(), 'uploads', 'subscription-proofs');
      mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const extension = extname(file.originalname).toLowerCase();
      const safeBase = file.originalname
        .replace(extension, '')
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .slice(0, 60);
      cb(null, `${Date.now()}-${safeBase}${extension}`);
    },
  }),
  fileFilter: (_req: any, file: any, cb: any) => {
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
    @Request() req,
    @Body() dto: CreateSubscriptionRequestDto,
    @UploadedFile() file?: any,
  ) {
    return this.subscriptionRequestsService.create(req.user.userId, dto, file);
  }

  @Get('me')
  async findMine(@Request() req) {
    return this.subscriptionRequestsService.findMine(req.user.userId);
  }

  @Get('me/:id')
  async findMineById(@Request() req, @Param('id') id: string) {
    return this.subscriptionRequestsService.findMineById(req.user.userId, id);
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

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: UpdateSubscriptionRequestStatusDto,
  ) {
    return this.subscriptionRequestsService.updateStatus(id, req.user.userId, dto);
  }

  @Patch(':id/notes')
  async updateNotes(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: UpdateSubscriptionRequestNotesDto,
  ) {
    return this.subscriptionRequestsService.updateNotes(id, req.user.userId, dto);
  }

  @Post(':id/activate')
  async activate(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: ActivateSubscriptionRequestDto,
  ) {
    return this.subscriptionRequestsService.activate(id, req.user.userId, dto);
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
  async activateFromRequest(@Param('requestId') requestId: string, @Request() req) {
    return this.subscriptionRequestsService.activate(requestId, req.user.userId, {});
  }
}
