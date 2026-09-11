export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type PaymentMethod = 'MOBILE_MONEY' | 'CARD';
export type MobileMoneyProvider = 'AIRTEL' | 'MTN';

export type CardPaymentDetails = {
  number: string;
  expiryMonth: string;
  expiryYear: string;
  securityCode: string;
  holderName: string;
  billing: {
    firstName: string;
    lastName: string;
    address1: string;
    locality: string;
    administrativeArea: string;
    postalCode: string;
    country: string;
    email: string;
  };
};

export type InitializePaymentInput = {
  paymentId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  paymentMethod: PaymentMethod;
  reference: string;
  description?: string;
  metadata?: Record<string, unknown>;
  phoneNumber?: string;
  provider?: MobileMoneyProvider;
  card?: CardPaymentDetails;
};

export type ProviderPaymentResult = {
  providerReference: string;
  status:
    | 'PENDING'
    | 'REQUIRES_ACTION'
    | 'PROCESSING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELLED';
  redirectUrl?: string;
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
  initialize(input: InitializePaymentInput): Promise<ProviderPaymentResult>;
  getPayment(providerReference: string): Promise<ProviderPaymentResult>;
  verifyWebhook(rawBody: Buffer, signature: string): VerifiedPaymentEvent;
  refund(
    providerReference: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<ProviderRefundResult>;
  getRefund(providerReference: string): Promise<ProviderRefundResult>;
}
