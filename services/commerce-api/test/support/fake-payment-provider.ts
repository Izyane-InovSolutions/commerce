import { randomUUID } from 'node:crypto';

import type {
  InitializePaymentInput,
  PaymentProvider,
  ProviderPaymentResult,
  ProviderRefundResult,
  VerifiedPaymentEvent,
} from '../../src/modules/payments/payment-provider';

/**
 * A trivial in-memory PaymentProvider test double so checkout e2e specs can
 * exercise a full success/failure path without a real gateway. `initialize`
 * always succeeds immediately; `pushEvent`/`verifyWebhook` let a test
 * simulate a gateway webhook delivery for a given provider reference.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake-provider';
  private readonly pendingEvents: VerifiedPaymentEvent[] = [];

  initialize(input: InitializePaymentInput): Promise<ProviderPaymentResult> {
    return Promise.resolve({
      providerReference: `fake-ref-${input.paymentId}`,
      status: 'PENDING',
      redirectUrl: `https://fake-gateway.example/pay/${input.paymentId}`,
    });
  }

  getPayment(): Promise<ProviderPaymentResult> {
    return Promise.reject(new Error('Not implemented in FakePaymentProvider'));
  }

  verifyWebhook(rawBody: Buffer): VerifiedPaymentEvent {
    const event = this.pendingEvents.shift();

    if (!event) {
      throw new Error(
        'No queued webhook event for FakePaymentProvider to verify',
      );
    }

    void rawBody;
    return event;
  }

  refund(): Promise<ProviderRefundResult> {
    return Promise.reject(new Error('Not implemented in FakePaymentProvider'));
  }

  getRefund(): Promise<ProviderRefundResult> {
    return Promise.reject(new Error('Not implemented in FakePaymentProvider'));
  }

  // Test seam: queues the event the next verifyWebhook() call returns.
  queueEvent(
    providerReference: string,
    status: ProviderPaymentResult['status'],
  ): void {
    this.pendingEvents.push({
      id: randomUUID(),
      providerReference,
      type: `payment.${status.toLowerCase()}`,
      status,
      payload: {},
    });
  }
}
