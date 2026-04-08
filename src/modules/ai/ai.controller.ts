import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateChatSessionDto } from './dto/create-chat-session.dto';

const usageCounts = new Map<string, { count: number; date: string }>();

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

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
  async chat(@Body('message') message: string, @Req() req: any) {
    const userId = req.user.userId;
    const usage = this.validateDailyUsage(userId);

    if (!usage.allowed) {
      return {
        success: false,
        response: `Has alcanzado el limite diario de ${usage.limit} mensajes. Vuelve manana.`,
        remaining: 0,
        timestamp: new Date(),
      };
    }

    const aiResult = await this.aiService.generateResponse(message);

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
  async chatSession(@Body() dto: CreateChatSessionDto, @Req() req: any) {
    const userId = req.user.userId;
    const usage = this.validateDailyUsage(userId);

    if (!usage.allowed) {
      return {
        success: false,
        response: `Has alcanzado el limite diario de ${usage.limit} mensajes. Vuelve manana.`,
        remaining: 0,
        timestamp: new Date(),
      };
    }

    const result = await this.aiService.generateConversationResponse(
      userId,
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
}
