import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  NotFoundException,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UnifiedPaymentProvider } from './unified-payment.provider';
import { PaymentOutcomeUnknownException } from './gateway-errors';
import type { InitializePaymentInput } from './payment-provider';
import { GatewayPaymentQueryDto } from './dto/gateway-payment.dto';

describe('UnifiedPaymentProvider', () => {
  let provider: UnifiedPaymentProvider;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  const data = {
    paymentId: 'pay_123',
    status: 'PENDING',
    amount: 123.45,
    currency: 'ZMW',
    reference: 'order-1',
  };
  const input: InitializePaymentInput = {
    paymentId: 'local-1',
    reference: 'order-1',
    amount: 12345,
    currency: 'ZMW',
    idempotencyKey: 'order-1',
    details: {
      paymentMethod: 'MOBILE_MONEY',
      phoneNumber: '0970000000',
      provider: 'AIRTEL',
    },
  };
  function reply(value: unknown, status = 200): void {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(value), { status })),
    );
  }
  beforeEach(() => {
    provider = new UnifiedPaymentProvider(
      new ConfigService({
        PAYMENTS_PROVIDER: 'unified',
        UNIFIED_PAYMENTS_BASE_URL: 'https://gateway.example',
        UNIFIED_PAYMENTS_API_KEY: 'test-only-key',
        UNIFIED_PAYMENTS_MERCHANT_ID: 'KAUSA',
      }),
    );
    fetchMock = jest.spyOn(globalThis, 'fetch');
    reply({ success: true, data });
  });
  afterEach(() => jest.restoreAllMocks());

  it('converts minor units and sends only mobile fields with stable idempotency', async () => {
    await expect(provider.initialize(input)).resolves.toEqual({
      providerReference: 'pay_123',
      status: 'PENDING',
      gatewayStatus: 'PENDING',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gateway.example/api/v1/payments',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({
          'X-API-Key': 'test-only-key',
          'Idempotency-Key': 'order-1',
        }) as unknown,
        body: JSON.stringify({
          amount: 123.45,
          currency: 'ZMW',
          reference: 'order-1',
          merchantId: 'KAUSA',
          paymentMethod: 'MOBILE_MONEY',
          phoneNumber: '0970000000',
          provider: 'AIRTEL',
        }),
      }),
    );
  });

  it('sends card details transiently without mobile fields', async () => {
    const card = {
      number: '4111111111111111',
      expiryMonth: '12',
      expiryYear: '2031',
      securityCode: '123',
      holderName: 'Test Buyer',
      billing: {
        firstName: 'Test',
        lastName: 'Buyer',
        address1: '1 Test Road',
        locality: 'Lusaka',
        administrativeArea: 'LK',
        postalCode: '10101',
        country: 'ZM',
        email: 'buyer@example.com',
      },
    };
    reply({ success: true, data: { ...data, currency: 'USD' } });
    await provider.initialize({
      ...input,
      currency: 'USD',
      details: { paymentMethod: 'CARD', card },
    });
    expect(fetchMock.mock.calls[0][1]?.body).toBe(
      JSON.stringify({
        amount: 123.45,
        currency: 'USD',
        reference: 'order-1',
        merchantId: 'KAUSA',
        paymentMethod: 'CARD',
        card,
      }),
    );
  });

  it('rejects mixed methods and unsupported currencies before network access', async () => {
    await expect(
      provider.initialize({ ...input, currency: 'USD' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      provider.initialize({
        ...input,
        details: { ...input.details!, card: {} as never },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a configured HTTPS origin before sending credentials', async () => {
    const insecure = new UnifiedPaymentProvider(
      new ConfigService({
        PAYMENTS_PROVIDER: 'unified',
        UNIFIED_PAYMENTS_BASE_URL: 'http://gateway.example',
        UNIFIED_PAYMENTS_API_KEY: 'test-only',
      }),
    );
    await expect(insecure.initialize(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the gateway ID and a bodyless POST for status', async () => {
    await provider.getDetails('pay_123');
    await provider.checkStatus('pay_123');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://gateway.example/api/v1/payments/pay_123',
      expect.objectContaining({ method: 'GET', body: undefined }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://gateway.example/api/v1/payments/pay_123/status',
      expect.objectContaining({ method: 'POST', body: undefined }),
    );
    await expect(provider.checkStatus('Kausa')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not infer local success from an undocumented status', async () => {
    reply({ success: true, data: { ...data, status: 'COMPLETED' } });
    await expect(provider.initialize(input)).resolves.toMatchObject({
      status: 'PENDING',
      gatewayStatus: 'COMPLETED',
    });
  });

  it('preserves unknown outcomes for timeouts and inconsistent responses', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Timeout'));
    await expect(provider.initialize(input)).rejects.toBeInstanceOf(
      PaymentOutcomeUnknownException,
    );
    reply({ success: true, data: { ...data, amount: 1 } });
    await expect(provider.initialize(input)).rejects.toBeInstanceOf(
      PaymentOutcomeUnknownException,
    );
    reply({ success: true, data: {} });
    await expect(provider.initialize(input)).rejects.toBeInstanceOf(
      PaymentOutcomeUnknownException,
    );
  });

  it('surfaces unsupported cancellation and refunds without fake success', async () => {
    reply({ success: false, error: { code: 'OPERATION_NOT_SUPPORTED' } }, 422);
    await expect(
      provider.cancelPayment('pay_123', 'Customer request'),
    ).rejects.toBeInstanceOf(NotImplementedException);
    reply({ success: false, error: { code: 'OPERATION_NOT_SUPPORTED' } }, 422);
    await expect(
      provider.requestRefund('pay_123', 1, 'Customer request', 'refund-key'),
    ).rejects.toBeInstanceOf(NotImplementedException);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://gateway.example/api/v1/payments/pay_123/refund',
      expect.objectContaining({
        body: JSON.stringify({ amount: 0.01, reason: 'Customer request' }),
        headers: expect.objectContaining({
          'Idempotency-Key': 'refund-key',
        }) as unknown,
      }),
    );
  });

  it('maps the documented payment-not-found error', async () => {
    reply({ success: false, error: { code: 'PAYMENT_NOT_FOUND' } }, 404);
    await expect(provider.getDetails('pay_missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('uses zero-based pagination and strips unneeded provider payload fields', async () => {
    reply({
      success: true,
      data: {
        content: [
          { ...data, card: 'sensitive', metadata: { secret: 'value' } },
        ],
        page: 0,
        size: 25,
        totalElements: 1,
        totalPages: 1,
        first: true,
        last: true,
      },
    });
    await expect(
      provider.listPayments(new GatewayPaymentQueryDto()),
    ).resolves.toMatchObject({ content: [data] });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gateway.example/api/v1/payments?page=0&size=25&sortBy=createdAt&descending=true',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects unverified webhooks', () => {
    expect(() => provider.verifyWebhook()).toThrow(NotImplementedException);
  });
});
