import { BadGatewayException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { UnifiedPaymentsProvider } from './unified-payments.provider';

describe('UnifiedPaymentsProvider', () => {
  const getOrThrow = jest.fn();
  const get = jest.fn();
  const config = { getOrThrow, get } as unknown as ConfigService;
  const provider = new UnifiedPaymentsProvider(config);

  beforeEach(() => {
    jest.clearAllMocks();
    getOrThrow.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        UNIFIED_PAYMENTS_API_URL: 'http://72.62.61.21:9002',
        UNIFIED_PAYMENTS_API_KEY: 'nsk_test_key',
      };
      return values[key];
    });
    get.mockImplementation((key: string) => {
      const values: Record<string, string | undefined> = {
        UNIFIED_PAYMENTS_MERCHANT_ID: 'DEMO_MERCHANT',
        UNIFIED_PAYMENTS_CALLBACK_URL: undefined,
      };
      return values[key];
    });
  });

  it('creates a mobile-money payment using the documented API contract', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              paymentId: 'pay_123',
              status: 'PENDING',
            },
            correlationId: 'corr_123',
          }),
          { status: 200 },
        ),
      );

    const result = await provider.initialize({
      paymentId: 'internal-payment-1',
      amount: 10000,
      currency: 'ZMW',
      idempotencyKey: 'order-1',
      paymentMethod: 'MOBILE_MONEY',
      reference: 'order-1',
      phoneNumber: '0977123456',
      provider: 'AIRTEL',
    });

    expect(result).toEqual({
      providerReference: 'pay_123',
      status: 'PENDING',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://72.62.61.21:9002/api/v1/payments',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'nsk_test_key',
          'Idempotency-Key': 'order-1',
        },
      }),
    );

    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual({
      merchantId: 'DEMO_MERCHANT',
      amount: 100,
      currency: 'ZMW',
      paymentMethod: 'MOBILE_MONEY',
      reference: 'order-1',
      phoneNumber: '0977123456',
      provider: 'AIRTEL',
    });
  });

  it('rejects undocumented gateway status values rather than guessing their meaning', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            paymentId: 'pay_123',
            status: 'COMPLETED',
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      provider.initialize({
        paymentId: 'internal-payment-1',
        amount: 10000,
        currency: 'ZMW',
        idempotencyKey: 'order-1',
        paymentMethod: 'MOBILE_MONEY',
        reference: 'order-1',
        phoneNumber: '0977123456',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
