import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type VerificationChannel = 'email' | 'sms';
type EmailProvider = 'none' | 'resend';
type SmsProvider = 'none' | 'twilio';

type SendVerificationCodeInput = {
  channel: VerificationChannel;
  to?: string;
  code: string;
  purpose: 'emailChange' | 'twoFactor';
};

type NotificationDeliveryResult = {
  delivered: boolean;
  provider: EmailProvider | SmsProvider;
  devCodeAllowed: boolean;
};

const PROVIDER_TIMEOUT_MS = 10000;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendVerificationCode(
    input: SendVerificationCodeInput,
  ): Promise<NotificationDeliveryResult> {
    if (!input.to?.trim()) {
      const message = `No recipient configured for ${input.channel} code`;
      if (this.isProduction()) {
        throw new Error(message);
      }
      this.logger.warn(message);
      return {
        delivered: false,
        provider: this.getProviderForChannel(input.channel),
        devCodeAllowed: this.shouldExposeDevCode(input.channel),
      };
    }

    if (input.channel === 'email') {
      return this.sendEmailCode(input);
    }

    return this.sendSmsCode(input);
  }

  shouldExposeDevCode(channel: VerificationChannel) {
    return (
      !this.isProduction() && this.getProviderForChannel(channel) === 'none'
    );
  }

  private async sendEmailCode(
    input: SendVerificationCodeInput,
  ): Promise<NotificationDeliveryResult> {
    const provider = this.getEmailProvider();

    if (provider !== 'resend') {
      if (this.isProduction()) {
        throw new Error('Email provider is required in production');
      }
      this.logger.log('Email provider not configured; skipping email delivery');
      return { delivered: false, provider, devCodeAllowed: true };
    }

    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const from = this.configService.get<string>('EMAIL_FROM');

    if (!apiKey || !from) {
      throw new Error('RESEND_API_KEY and EMAIL_FROM are required for email');
    }

    const response = await this.fetchWithTimeout(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [input.to.trim()],
          subject:
            input.purpose === 'twoFactor'
              ? 'Codigo de acceso MenteAmiga-AI'
              : 'Codigo para cambiar tu correo',
          text: `Tu codigo de verificacion es ${input.code}. Expira en 10 minutos. Si no solicitaste este codigo, ignora este mensaje.`,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Email provider rejected request: ${response.status}`);
    }

    return { delivered: true, provider, devCodeAllowed: false };
  }

  private async sendSmsCode(
    input: SendVerificationCodeInput,
  ): Promise<NotificationDeliveryResult> {
    const provider = this.getSmsProvider();

    if (provider !== 'twilio') {
      if (this.isProduction()) {
        throw new Error('SMS provider is required in production');
      }
      this.logger.log('SMS provider not configured; skipping SMS delivery');
      return { delivered: false, provider, devCodeAllowed: true };
    }

    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.configService.get<string>('TWILIO_FROM_NUMBER');

    if (!accountSid || !authToken || !from) {
      throw new Error('Twilio credentials are required for SMS');
    }

    const to = input.to.trim();
    if (!this.isE164Phone(to)) {
      throw new Error('Phone number for SMS must use E.164 format');
    }

    const body = new URLSearchParams({
      From: from,
      To: to,
      Body: `MenteAmiga-AI: tu codigo es ${input.code}. Expira en 10 minutos.`,
    });

    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString(
      'base64',
    );
    const response = await this.fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );

    if (!response.ok) {
      throw new Error(`SMS provider rejected request: ${response.status}`);
    }

    return { delivered: true, provider, devCodeAllowed: false };
  }

  private isProduction() {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private getProviderForChannel(channel: VerificationChannel) {
    return channel === 'email'
      ? this.getEmailProvider()
      : this.getSmsProvider();
  }

  private getEmailProvider(): EmailProvider {
    const provider = this.configService.get<string>('EMAIL_PROVIDER') || 'none';
    return provider === 'resend' ? 'resend' : 'none';
  }

  private getSmsProvider(): SmsProvider {
    const provider = this.configService.get<string>('SMS_PROVIDER') || 'none';
    return provider === 'twilio' ? 'twilio' : 'none';
  }

  private isE164Phone(phone: string) {
    return /^\+[1-9]\d{7,14}$/.test(phone);
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Notification provider request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
