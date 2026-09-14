import type { PaymentDetailsDto } from './dto/payment-details.dto';
import type { SettlementQuote } from './payment-currency-converter';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type InitializePaymentInput = {
  paymentId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  reference?: string;
  /** Free text the gateway shows on statements and receipts. */
  description?: string;
  /** Echoed back unmodified, so it is where reconciliation keys belong. */
  metadata?: Record<string, string>;
  details?: PaymentDetailsDto;
};

export type ProviderPaymentResult = {
  /** Private gateway amounts for reconciliation against the stored quote. */
  amount?: number;
  currency?: string;
  reference?: string;
  providerReference: string;
  /** Set only once the gateway reports a payment as failed. */
  failureCode?: string;
  failureMessage?: string;
  status:
    | 'PENDING'
    | 'REQUIRES_ACTION'
    | 'PROCESSING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELLED';
  redirectUrl?: string;
  gatewayStatus?: string;
};

export type ProviderRefundResult = {
  providerReference: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
};

export type VerifiedPaymentEvent = {
  id: string;
  providerReference: string;
  type: string;
  status: ProviderPaymentResult['status'];
  payload: Record<string, unknown>;
};

export interface PaymentProvider {
  readonly name: string;
  prepareInput?(
    input: InitializePaymentInput,
  ): InitializePaymentInput & { settlement?: SettlementQuote };
  validateInput?(input: InitializePaymentInput): void;
  initialize(input: InitializePaymentInput): Promise<ProviderPaymentResult>;
  getPayment(providerReference: string): Promise<ProviderPaymentResult>;
  verifyWebhook(rawBody: Buffer, signature: string): VerifiedPaymentEvent;
  refund(
    providerReference: string,
    amount: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<ProviderRefundResult>;
  getRefund(providerReference: string): Promise<ProviderRefundResult>;
}
