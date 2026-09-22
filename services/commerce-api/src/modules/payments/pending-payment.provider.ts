import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import type {
  InitializePaymentInput,
  PaymentProvider,
  ProviderPaymentResult,
  ProviderRefundResult,
  VerifiedPaymentEvent,
} from './payment-provider';

@Injectable()
export class PendingPaymentProvider implements PaymentProvider {
  readonly name = 'pending-integration';

  initialize(input: InitializePaymentInput): Promise<ProviderPaymentResult> {
    void input;
    return this.unavailable();
  }

  getPayment(providerReference: string): Promise<ProviderPaymentResult> {
    void providerReference;
    return this.unavailable();
  }

  verifyWebhook(rawBody: Buffer, signature: string): VerifiedPaymentEvent {
    void rawBody;
    void signature;
    throw this.error();
  }

  refund(
    providerReference: string,
    amount: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<ProviderRefundResult> {
    void providerReference;
    void amount;
    void reason;
    void idempotencyKey;
    return this.unavailable();
  }

  getRefund(providerReference: string): Promise<ProviderRefundResult> {
    void providerReference;
    return this.unavailable();
  }

  private unavailable<T>(): Promise<T> {
    return Promise.reject(this.error());
  }

  private error(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'Payment integration is awaiting the external provider API',
    );
  }
}
