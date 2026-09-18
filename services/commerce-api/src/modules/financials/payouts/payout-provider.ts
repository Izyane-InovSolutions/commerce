import type { Prisma } from '@prisma/client';

export const PAYOUT_PROVIDER = Symbol('PAYOUT_PROVIDER');

export type PayoutProviderInput = {
  requestId: string;
  attemptId: string;
  amount: number;
  currency: string;
  destination: Prisma.JsonValue;
};

export type PayoutProviderResult = {
  outcome: 'SUCCEEDED' | 'FAILED' | 'RECONCILIATION_REQUIRED';
  providerReference?: string;
  failureReason?: string;
  response?: Prisma.InputJsonValue;
};

export interface PayoutProvider {
  readonly name: string;
  submit(input: PayoutProviderInput): Promise<PayoutProviderResult>;
}
