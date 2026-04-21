import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  getHealth() {
    return {
      ok: true,
      service: 'menteamiga-backend',
      environment: this.configService.get<string>('NODE_ENV') || 'development',
    };
  }
}
