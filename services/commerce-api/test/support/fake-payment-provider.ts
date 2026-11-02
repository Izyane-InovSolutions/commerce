import { randomUUID } from 'node:crypto';

import type {
  InitializePaymentInput,
  PaymentProvider,
  ProviderPaymentResult,
  ProviderRefundResult,
  VerifiedPaymentEvent,
} from '../../src/modules/payments/payment-provider';

/** How one `initialize` call behaves: resolve (accept/decline) or throw. */
export type InitializeBehaviour = (
  input: InitializePaymentInput,
) => Promise<ProviderPaymentResult>;

/**
 * A trivial in-memory PaymentProvider test double so checkout e2e specs can
 * exercise a full success/failure path without a real gateway. `initialize`
 * succeeds immediately unless a spec scripted the call (`scriptInitialize`):
 * it can then wait on a test-controlled promise, decline, or throw. Every
 * call is recorded, so a spec can prove a retry never re-submitted a charge.
 * `pushEvent`/`verifyWebhook` let a test simulate a gateway webhook delivery
 * for a given provider reference.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake-provider';
  /** Every `initialize` input, in call order (scripted or not). */
  readonly initializeCalls: InitializePaymentInput[] = [];
  private readonly pendingEvents: VerifiedPaymentEvent[] = [];
  private readonly scripted: InitializeBehaviour[] = [];

  initialize(input: InitializePaymentInput): Promise<ProviderPaymentResult> {
    this.initializeCalls.push(input);
    const behaviour = this.scripted.shift();
    return behaviour ? behaviour(input) : Promise.resolve(this.accepted(input));
  }

  /** The result an unscripted call returns: accepted, awaiting the customer. */
  accepted(input: InitializePaymentInput): ProviderPaymentResult {
    return {
      providerReference: `fake-ref-${input.paymentId}`,
      status: 'PENDING',
      redirectUrl: `https://fake-gateway.example/pay/${input.paymentId}`,
    };
  }

  // Test seam: the next `initialize` calls behave as queued, first in first out.
  scriptInitialize(...behaviours: InitializeBehaviour[]): void {
    this.scripted.push(...behaviours);
  }

  // Test seam: forgets recorded calls, scripted behaviours and queued events.
  reset(): void {
    this.initializeCalls.length = 0;
    this.scripted.length = 0;
    this.pendingEvents.length = 0;
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
