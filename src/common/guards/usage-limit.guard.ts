import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class UsageLimitGuard implements CanActivate {
  private dailyCounts: Map<string, { count: number; date: string }> = new Map();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    
    if (!userId) return true;

    const DAILY_LIMIT = 5; // 5 mensajes por día para probar (cambia a 20 después)
    const today = new Date().toDateString();
    
    let userStats = this.dailyCounts.get(userId);
    
    if (!userStats || userStats.date !== today) {
      userStats = { count: 0, date: today };
      this.dailyCounts.set(userId, userStats);
    }
    
    console.log(`Usuario ${userId}: ${userStats.count}/${DAILY_LIMIT} mensajes hoy`);
    
    if (userStats.count >= DAILY_LIMIT) {
      throw new ForbiddenException(`Has alcanzado el límite diario de ${DAILY_LIMIT} mensajes.`);
    }
    
    userStats.count++;
    this.dailyCounts.set(userId, userStats);
    request.remainingMessages = DAILY_LIMIT - userStats.count;
    
    return true;
  }
}