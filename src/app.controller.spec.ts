import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            getHealth: jest.fn().mockReturnValue({
              ok: true,
              service: 'menteamiga-backend',
              environment: 'test',
              timestamp: '2026-05-15T00:00:00.000Z',
              uptime: 123,
            }),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('returns health information from the app service at root', () => {
      expect(appController.getRoot()).toEqual({
        ok: true,
        service: 'menteamiga-backend',
        environment: 'test',
        timestamp: '2026-05-15T00:00:00.000Z',
        uptime: 123,
      });
    });

    it('returns health information from the health endpoint', () => {
      expect(appController.getHealth()).toEqual({
        ok: true,
        service: 'menteamiga-backend',
        environment: 'test',
        timestamp: '2026-05-15T00:00:00.000Z',
        uptime: 123,
      });
    });
  });
});
