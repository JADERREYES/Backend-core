import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';

const createService = (env: Record<string, string | undefined>) =>
  new NotificationsService({
    get: (key: string) => env[key],
  } as ConfigService);

describe('NotificationsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps dev codes only when the selected channel has no real provider', async () => {
    const service = createService({
      NODE_ENV: 'development',
      EMAIL_PROVIDER: 'none',
    });

    const result = await service.sendVerificationCode({
      channel: 'email',
      to: 'user@menteamiga.test',
      code: '123456',
      purpose: 'twoFactor',
    });

    expect(result).toEqual({
      delivered: false,
      provider: 'none',
      devCodeAllowed: true,
    });
  });

  it('sends Resend email with the expected security-code payload', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const service = createService({
      NODE_ENV: 'development',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 'resend-token',
      EMAIL_FROM: 'MenteAmiga <security@menteamiga.test>',
    });

    const result = await service.sendVerificationCode({
      channel: 'email',
      to: 'user@menteamiga.test',
      code: '654321',
      purpose: 'emailChange',
    });

    expect(result).toEqual({
      delivered: true,
      provider: 'resend',
      devCodeAllowed: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer resend-token',
        }),
        body: expect.any(String),
      }),
    );

    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(typeof requestInit?.body).toBe('string');
    const bodyText =
      typeof requestInit?.body === 'string' ? requestInit.body : '{}';
    const body = JSON.parse(bodyText) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
    };
    expect(body.from).toBe('MenteAmiga <security@menteamiga.test>');
    expect(body.to).toEqual(['user@menteamiga.test']);
    expect(body.subject).toContain('correo');
    expect(body.text).toContain('654321');
  });

  it('rejects Twilio SMS when the recipient phone is not E.164', async () => {
    const service = createService({
      NODE_ENV: 'development',
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
      TWILIO_AUTH_TOKEN: 'twilio-token',
      TWILIO_FROM_NUMBER: '+573001112233',
    });

    await expect(
      service.sendVerificationCode({
        channel: 'sms',
        to: '3001112233',
        code: '123456',
        purpose: 'twoFactor',
      }),
    ).rejects.toThrow('Phone number for SMS must use E.164 format');
  });
});
