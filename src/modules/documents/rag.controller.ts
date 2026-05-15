import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { DocumentsRagService } from './documents-rag.service';
import { SearchRagDto } from './dto/search-rag.dto';

type ChunkOwnerType = 'admin' | 'user' | 'system';

@Controller('rag')
@UseGuards(JwtAuthGuard)
export class RagController {
  constructor(private readonly documentsRagService: DocumentsRagService) {}

  @Post('search')
  async search(
    @Body() payload: SearchRagDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const requestedUserId = payload.userId?.trim();

    if (requestedUserId && user.role !== 'superadmin' && requestedUserId !== user.userId) {
      throw new ForbiddenException('No puedes consultar contexto de otro usuario');
    }

    const effectiveUserId =
      user.role === 'superadmin'
        ? requestedUserId
        : requestedUserId || user.userId;
    const ownerTypes: ChunkOwnerType[] = payload.ownerType
      ? [payload.ownerType]
      : effectiveUserId
        ? ['admin', 'user']
        : ['admin'];

    return this.documentsRagService.retrieveRelevantContext(
      payload.query || '',
      payload.limit || 5,
      {
        ownerTypes,
        userId: effectiveUserId,
        tenantId: payload.tenantId?.trim(),
        organizationId: payload.organizationId?.trim(),
        includeGlobalAdmin: true,
      },
    );
  }
}
