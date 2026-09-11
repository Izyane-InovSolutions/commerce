import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  InitializePaymentInput,
  PaymentProvider,
  ProviderPaymentResult,
  ProviderRefundResult,
  VerifiedPaymentEvent,
} from '../../modules/payments/payment-provider';

const STATUS_MAP: Record<string, ProviderPaymentResult['status']> = {
  PENDING: 'PENDING',
};

type UnifiedPaymentsResponse = {
  success: boolean;
  data?: {
    paymentId: string;
    status: string;
    failureCode?: string;
    failureMessage?: string;
  };
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ field?: string; message?: string }>;
  };
  correlationId?: string;
};

@Injectable()
export class UnifiedPaymentsProvider implements PaymentProvider {
  readonly name = 'unified-payments';

  constructor(private readonly config: ConfigService) {}

  async initialize(
    input: InitializePaymentInput,
  ): Promise<ProviderPaymentResult> {
    const baseUrl = this.config.getOrThrow<string>('UNIFIED_PAYMENTS_API_URL');
    const apiKey = this.config.getOrThrow<string>('UNIFIED_PAYMENTS_API_KEY');
    const merchantId = this.config.get<string>('UNIFIED_PAYMENTS_MERCHANT_ID');
    const callbackUrl = this.config.get<string>('UNIFIED_PAYMENTS_CALLBACK_URL');

    const body: Record<string, unknown> = {
      ...(merchantId ? { merchantId } : {}),
      amount: input.amount / 100,
      currency: input.currency,
      paymentMethod: input.paymentMethod,
      reference: input.reference,
      ...(input.description ? { description: input.description } : {}),
      ...(callbackUrl ? { callbackUrl } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };

    if (input.paymentMethod === 'MOBILE_MONEY') {
      if (!input.phoneNumber) {
        throw new BadGatewayException(
          'Mobile money payments require a phone number',
        );
      }

      body.phoneNumber = input.phoneNumber;
      if (input.provider) {
        body.provider = input.provider;
      }
    } else {
      if (!input.card) {
        throw new BadGatewayException('Card payments require card details');
      }

      body.card = input.card;
    }

    const response = await this.request(baseUrl, apiKey, input.idempotencyKey, body);

    if (!response.success || !response.data) {
      throw new BadGatewayException(
        this.formatGatewayError(response),
      );
    }

    const status = STATUS_MAP[response.data.status];
    if (!status) {
      throw new BadGatewayException(
        `Unified Payments returned an undocumented payment status: ${response.data.status}`,
      );
    }

    return {
      providerReference: response.data.paymentId,
      status,
    };
  }

  async getPayment(_providerReference: string): Promise<ProviderPaymentResult> {
    throw new BadGatewayException(
      'Unified Payments payment-status endpoint is not documented yet',
    );
  }

  verifyWebhook(_rawBody: Buffer, _signature: string): VerifiedPaymentEvent {
    throw new BadGatewayException(
      'Unified Payments webhook payload/signature contract is not documented yet',
    );
  }

  async refund(
    _providerReference: string,
    _amount: number,
    _idempotencyKey: string,
  ): Promise<ProviderRefundResult> {
    throw new BadGatewayException(
      'Unified Payments refund endpoint is not documented yet',
    );
  }

  async getRefund(_providerReference: string): Promise<ProviderRefundResult> {
    throw new BadGatewayException(
      'Unified Payments refund-status endpoint is not documented yet',
    );
  }

  private async request(
    baseUrl: string,
    apiKey: string,
    idempotencyKey: string,
    body: Record<string, unknown>,
  ): Promise<UnifiedPaymentsResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const payload = (await response.json()) as UnifiedPaymentsResponse;

      if (!response.ok) {
        throw new BadGatewayException(this.formatGatewayError(payload));
      }

      return payload;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new BadGatewayException(
        error instanceof Error
          ? `Unable to reach Unified Payments: ${error.message}`
          : 'Unable to reach Unified Payments',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private formatGatewayError(response: UnifiedPaymentsResponse): string {
    const details = response.error?.details
      ?.map((detail) => `${detail.field ?? 'request'}: ${detail.message ?? 'invalid'}`)
      .join('; ');

    return [
      response.error?.code,
      response.error?.message,
      details,
      response.correlationId ? `correlationId=${response.correlationId}` : undefined,
    ]
      .filter(Boolean)
      .join(' - ') || 'Unified Payments rejected the payment request';
  }
}
