import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type {
  InitializePaymentInput,
  PaymentProvider,
  ProviderPaymentResult,
  ProviderRefundResult,
  VerifiedPaymentEvent,
} from './payment-provider';
import { PaymentDetailsDto } from './dto/payment-details.dto';
import { GatewayPaymentQueryDto } from './dto/gateway-payment.dto';
import { PaymentOutcomeUnknownException } from './gateway-errors';

export type GatewayPayment = {
  paymentId: string;
  status: string;
  amount: number;
  currency: string;
  reference: string;
};
export type GatewayPaymentPage = {
  content: GatewayPayment[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
};
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class UnifiedPaymentProvider implements PaymentProvider {
  readonly name = 'unified';
  constructor(private readonly config: ConfigService) {}

  async initialize(
    input: InitializePaymentInput,
  ): Promise<ProviderPaymentResult> {
    this.validateInput(input);
    const details = input.details!;
    const merchantId = this.config.get<string>('UNIFIED_PAYMENTS_MERCHANT_ID');
    const body = {
      amount: input.amount / 100,
      currency: input.currency,
      reference: input.reference ?? input.paymentId,
      ...(merchantId ? { merchantId } : {}),
      paymentMethod: details.paymentMethod,
      ...(details.paymentMethod === 'MOBILE_MONEY'
        ? {
            phoneNumber: details.phoneNumber,
            ...(details.provider ? { provider: details.provider } : {}),
          }
        : { card: details.card }),
    };
    const payment = this.payment(
      await this.request(
        '/api/v1/payments',
        'POST',
        body,
        input.idempotencyKey,
      ),
    );
    if (
      payment.reference !== body.reference ||
      payment.currency !== input.currency ||
      Math.round(payment.amount * 100) !== input.amount
    )
      throw new PaymentOutcomeUnknownException();
    // Only PENDING is documented. Preserve external statuses for reconciliation
    // without inventing terminal status mappings that could release inventory.
    return {
      providerReference: payment.paymentId,
      status: 'PENDING',
      gatewayStatus: payment.status,
    };
  }

  validateInput(input: InitializePaymentInput): void {
    this.connection();
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
      throw new BadRequestException(
        'Payment amount must be positive minor units',
      );
    if (!input.details)
      throw new BadRequestException('Payment details are required');
    const details = plainToInstance(PaymentDetailsDto, input.details);
    if (
      validateSync(details, { whitelist: true, forbidNonWhitelisted: true })
        .length
    )
      throw new BadRequestException('Invalid payment details');
    if (details.paymentMethod === 'MOBILE_MONEY') {
      if (details.card !== undefined || input.currency !== 'ZMW')
        throw new BadRequestException(
          'Mobile money requires ZMW and must not include card details',
        );
    } else if (
      details.phoneNumber !== undefined ||
      details.provider !== undefined ||
      !['USD', 'GBP'].includes(input.currency)
    ) {
      throw new BadRequestException(
        'Card payments require USD or GBP and must not include mobile money fields',
      );
    }
  }

  async getPayment(id: string): Promise<ProviderPaymentResult> {
    const payment = await this.getDetails(id);
    return {
      providerReference: payment.paymentId,
      status: 'PENDING',
      gatewayStatus: payment.status,
    };
  }
  async getDetails(id: string): Promise<GatewayPayment> {
    return this.payment(await this.request(this.path(id), 'GET'));
  }
  async checkStatus(id: string): Promise<GatewayPayment> {
    return this.payment(await this.request(`${this.path(id)}/status`, 'POST'));
  }
  async cancelPayment(id: string, reason: string): Promise<GatewayPayment> {
    return this.payment(
      await this.request(`${this.path(id)}/cancel`, 'POST', { reason }),
    );
  }
  async requestRefund(
    id: string,
    amount: number,
    reason: string,
    key: string,
  ): Promise<GatewayPayment> {
    return this.payment(
      await this.request(
        `${this.path(id)}/refund`,
        'POST',
        { amount: amount / 100, reason },
        key,
      ),
    );
  }

  async listPayments(
    query: GatewayPaymentQueryDto,
  ): Promise<GatewayPaymentPage> {
    const params = new URLSearchParams({
      page: String(query.page),
      size: String(query.size),
      sortBy: query.sortBy,
      descending: query.descending,
    });
    const data = await this.request(`/api/v1/payments?${params}`, 'GET');
    if (
      !record(data) ||
      !Array.isArray(data.content) ||
      !['page', 'size', 'totalElements', 'totalPages'].every(
        (k) => Number.isSafeInteger(data[k]) && Number(data[k]) >= 0,
      ) ||
      typeof data.first !== 'boolean' ||
      typeof data.last !== 'boolean'
    )
      throw new BadGatewayException('Invalid gateway pagination response');
    return {
      content: data.content.map((value) => this.payment(value)),
      page: Number(data.page),
      size: Number(data.size),
      totalElements: Number(data.totalElements),
      totalPages: Number(data.totalPages),
      first: data.first,
      last: data.last,
    };
  }

  verifyWebhook(): VerifiedPaymentEvent {
    throw new NotImplementedException(
      'Gateway webhook verification is not documented',
    );
  }
  async refund(
    providerReference: string,
    amount: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<ProviderRefundResult> {
    const payment = await this.requestRefund(
      providerReference,
      amount,
      reason,
      idempotencyKey,
    );
    return this.toRefundResult(payment);
  }

  async getRefund(providerReference: string): Promise<ProviderRefundResult> {
    const payment = await this.getDetails(providerReference);
    return this.toRefundResult(payment);
  }

  // Only the documented statuses are trusted locally, matching initialize()'s
  // "never invent a terminal status" rule - anything else falls back to
  // PENDING rather than risk reporting a refund as done when it isn't.
  private toRefundResult(payment: GatewayPayment): ProviderRefundResult {
    const knownStatuses: ProviderRefundResult['status'][] = [
      'PENDING',
      'PROCESSING',
      'SUCCEEDED',
      'FAILED',
      'CANCELLED',
    ];
    const status = (knownStatuses as string[]).includes(payment.status)
      ? (payment.status as ProviderRefundResult['status'])
      : 'PENDING';
    return { providerReference: payment.paymentId, status };
  }

  private path(id: string): string {
    if (!/^pay_[A-Za-z0-9_-]+$/.test(id))
      throw new BadRequestException('A gateway payment ID is required');
    return `/api/v1/payments/${encodeURIComponent(id)}`;
  }

  private payment(value: unknown): GatewayPayment {
    if (
      !record(value) ||
      typeof value.paymentId !== 'string' ||
      !/^pay_[A-Za-z0-9_-]+$/.test(value.paymentId) ||
      typeof value.status !== 'string' ||
      !/^[A-Z_]{1,50}$/.test(value.status) ||
      typeof value.amount !== 'number' ||
      !Number.isFinite(value.amount) ||
      value.amount < 0 ||
      typeof value.currency !== 'string' ||
      !/^[A-Z]{3}$/.test(value.currency) ||
      typeof value.reference !== 'string'
    )
      throw new PaymentOutcomeUnknownException();
    return {
      paymentId: value.paymentId,
      status: value.status,
      amount: value.amount,
      currency: value.currency,
      reference: value.reference,
    };
  }

  private connection(): { base: string; key: string } {
    const key = this.config.get<string>('UNIFIED_PAYMENTS_API_KEY');
    const base = this.config.get<string>('UNIFIED_PAYMENTS_BASE_URL');
    if (
      this.config.get('PAYMENTS_PROVIDER', 'pending') !== 'unified' ||
      !key ||
      !base
    )
      throw new ServiceUnavailableException(
        'Unified Payments is not configured',
      );
    let url: URL;
    try {
      url = new URL(base);
    } catch {
      throw new ServiceUnavailableException('Invalid gateway base URL');
    }
    const allowsHttp = ['development', 'test'].includes(
      this.config.get<string>('NODE_ENV', 'production'),
    );

    if (
      (url.protocol !== 'https:' &&
        !(allowsHttp && url.protocol === 'http:')) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== '/' && url.pathname !== '')
    )
      throw new ServiceUnavailableException(
        allowsHttp
          ? 'Gateway base URL must be an HTTP or HTTPS origin'
          : 'Gateway base URL must be an HTTPS origin',
      );
    return { base: url.origin, key };
  }

  private async request(
    path: string,
    method: 'GET' | 'POST',
    body?: object,
    idempotencyKey?: string,
  ): Promise<unknown> {
    const { base, key } = this.connection();
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method,
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'X-API-Key': key,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(
          this.config.get<number>('UNIFIED_PAYMENTS_TIMEOUT_MS', 15000),
        ),
      });
    } catch {
      throw new PaymentOutcomeUnknownException();
    }
    let envelope: unknown;
    try {
      envelope = await response.json();
    } catch {
      throw new PaymentOutcomeUnknownException();
    }
    if (
      record(envelope) &&
      envelope.success === false &&
      record(envelope.error)
    ) {
      switch (envelope.error.code) {
        case 'OPERATION_NOT_SUPPORTED':
          throw new NotImplementedException(
            'The external provider does not support this operation',
          );
        case 'PAYMENT_NOT_FOUND':
          throw new NotFoundException('Gateway payment not found');
        default:
          if (response.status >= 400 && response.status < 500)
            throw new BadRequestException(
              'Gateway rejected the request; check merchant configuration and payment details',
            );
      }
    }
    if (
      !response.ok ||
      !record(envelope) ||
      envelope.success !== true ||
      !('data' in envelope)
    )
      throw new PaymentOutcomeUnknownException();
    return envelope.data;
  }
}
