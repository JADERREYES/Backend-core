import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { SubscriptionRequestsService } from './subscription-requests.service';

type QueryResult<T> = {
  lean: () => QueryResult<T>;
  exec: () => Promise<T>;
};

const queryResult = <T>(value: T): QueryResult<T> => ({
  lean: () => queryResult(value),
  exec: async () => value,
});

describe('SubscriptionRequestsService', () => {
  it('rejects creating a new request when the user already has a pending one', async () => {
    const userId = new Types.ObjectId().toString();
    const subscriptionRequestModel = {
      findOne: jest.fn(() => queryResult({ _id: new Types.ObjectId() })),
    };
    const userModel = {
      findById: jest.fn(() =>
        queryResult({
          _id: new Types.ObjectId(userId),
          email: 'user@menteamiga.test',
          name: 'Usuario',
        }),
      ),
    };

    const service = new SubscriptionRequestsService(
      subscriptionRequestModel as never,
      userModel as never,
      { findByIdOrFail: jest.fn() } as never,
      { findById: jest.fn() } as never,
      {
        findByUserId: jest.fn().mockResolvedValue({
          planCode: 'free',
          planName: 'Free',
          usageSnapshot: {
            messages: { used: 0, limit: 100 },
          },
        }),
      } as never,
      { upload: jest.fn() } as never,
    );

    await expect(
      service.create(
        userId,
        {
          planId: new Types.ObjectId().toString(),
          paymentMethodId: new Types.ObjectId().toString(),
          requestType: 'premium',
          payerPhone: '3001234567',
          reportedAmount: '29900',
          message: 'Pago realizado',
        },
        {
          buffer: Buffer.from('proof'),
          originalname: 'comprobante.png',
          mimetype: 'image/png',
          size: 100,
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
