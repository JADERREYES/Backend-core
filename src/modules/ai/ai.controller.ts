import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateChatSessionDto } from './dto/create-chat-session.dto';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { UserMemoriesService } from './user-memories.service';

const usageCounts = new Map<string, { count: number; date: string }>();

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly userMemoriesService: UserMemoriesService,
  ) {}

  private validateDailyUsage(userId: string) {
    const DAILY_LIMIT = 5;
    const today = new Date().toDateString();

    let userUsage = usageCounts.get(userId);
    if (!userUsage || userUsage.date !== today) {
      userUsage = { count: 0, date: today };
      usageCounts.set(userId, userUsage);
    }

    if (userUsage.count >= DAILY_LIMIT) {
      return {
        allowed: false,
        remaining: 0,
        limit: DAILY_LIMIT,
      };
    }

    userUsage.count++;
    usageCounts.set(userId, userUsage);

    return {
      allowed: true,
      remaining: DAILY_LIMIT - userUsage.count,
      limit: DAILY_LIMIT,
    };
  }

  @Post('chat')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async chat(
    @Body('message') message: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const usage = this.validateDailyUsage(user.userId);

    if (!usage.allowed) {
      return {
        success: false,
        response: `Has alcanzado el limite diario de ${usage.limit} mensajes. Vuelve manana.`,
        remaining: 0,
        timestamp: new Date(),
      };
    }

    const aiResult = await this.aiService.generateResponse(message, {
      userId: user.userId,
    });

    return {
      success: true,
      response: aiResult.text,
      contextUsed: aiResult.contextUsed,
      retrievalMode: aiResult.retrievalMode,
      sources: aiResult.sources,
      remaining: usage.remaining,
      timestamp: new Date(),
    };
  }

  @Post('chat-session')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async chatSession(
    @Body() dto: CreateChatSessionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const usage = this.validateDailyUsage(user.userId);

    if (!usage.allowed) {
      return {
        success: false,
        response: `Has alcanzado el limite diario de ${usage.limit} mensajes. Vuelve manana.`,
        remaining: 0,
        timestamp: new Date(),
      };
    }

    const result = await this.aiService.generateConversationResponse(
      user.userId,
      dto.message,
      dto.chatId,
      dto.title,
    );

    return {
      success: true,
      ...result,
      remaining: usage.remaining,
      timestamp: new Date(),
    };
  }

  @Get('memories')
  async listMemories(@CurrentUser() user: CurrentUserPayload) {
    return this.userMemoriesService.listActiveByUser(user.userId, 10);
  }

  @Put('memories/:id/disable')
  async disableMemory(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.userMemoriesService.disable(user.userId, id);
  }

  @Put('memories/:id/enable')
  async enableMemory(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.userMemoriesService.enable(user.userId, id);
  }

  @Delete('memories/:id')
  async deleteMemory(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.userMemoriesService.delete(user.userId, id);
  }
}
