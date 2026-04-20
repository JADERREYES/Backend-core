import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';

type UsageLimitRequest = Request & {
  user?: {
    userId?: string;
  };
  remainingMessages?: number;
};

@Injectable()
export class UsageLimitGuard implements CanActivate {
  private readonly dailyCounts = new Map<
    string,
    { count: number; date: string }
  >();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<UsageLimitRequest>();
    const userId = request.user?.userId;

    if (!userId) return true;

    const dailyLimit = 5;
    const today = new Date().toDateString();
    let userStats = this.dailyCounts.get(userId);

    if (!userStats || userStats.date !== today) {
      userStats = { count: 0, date: today };
      this.dailyCounts.set(userId, userStats);
    }

    if (userStats.count >= dailyLimit) {
      throw new ForbiddenException(
        `Has alcanzado el limite diario de ${dailyLimit} mensajes.`,
      );
    }

    userStats.count += 1;
    this.dailyCounts.set(userId, userStats);
    request.remainingMessages = dailyLimit - userStats.count;

    return true;
  }
}
