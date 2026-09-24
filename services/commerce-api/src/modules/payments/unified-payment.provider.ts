import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
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
import { PaymentCurrencyConverter } from './payment-currency-converter';
import { FxRatesService } from './fx-rates.service';

export type GatewayPayment = {
  paymentId: string;
  status: string;
  amount: number;
  currency: string;
  reference: string;
  failureCode?: string;
  failureMessage?: string;
  completedAt?: string;
  expiresAt?: string;
};

/**
 * Gateway statuses this system is willing to act on.
 *
 * Only the statuses here are, and only because each was observed on a real
 * payment — the gateway's documentation lists no status enum at all. Anything
 * else maps to PENDING below rather than being guessed at: reading an unknown
 * string as a failure would cancel an order that may yet be paid, and reading
 * one as a success would release goods for nothing. FAILED was confirmed on a
 * declined sandbox card charge, returned alongside a `completedAt` timestamp
 * and a `failureCode` — the gateway's own signal that the attempt is over,
 * not still in flight.
 */
const GATEWAY_STATUS: Record<string, ProviderPaymentResult['status']> = {
  SUCCESS: 'SUCCEEDED',
  FAILED: 'FAILED',
};

export function toProviderStatus(
  gatewayStatus: string,
): ProviderPaymentResult['status'] {
  return GATEWAY_STATUS[gatewayStatus] ?? 'PENDING';
}
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

/** Keeps an optional string field only when it carries something. */
function text(value: unknown, key: string): Record<string, string> {
  return typeof value === 'string' && value.trim() !== ''
    ? { [key]: value }
    : {};
}

@Injectable()
export class UnifiedPaymentProvider implements PaymentProvider {
  readonly name = 'unified';
  private readonly logger = new Logger(UnifiedPaymentProvider.name);
  constructor(
    private readonly config: ConfigService,
    private readonly fxRates: FxRatesService,
  ) {}

  prepareInput(input: InitializePaymentInput): InitializePaymentInput & {
    settlement?: import('./payment-currency-converter').SettlementQuote;
  } {
    if (input.currency !== 'ZMW')
      throw new BadRequestException('Orders must be priced in ZMW');
    if (input.details?.paymentMethod !== 'CARD') return input;
    const currency = this.config.get<string>(
      'UNIFIED_PAYMENTS_CARD_CURRENCY',
      'USD',
    );
    if (!['USD', 'GBP'].includes(currency))
      throw new ServiceUnavailableException(
        'This payment method is temporarily unavailable',
      );
    const settlement = new PaymentCurrencyConverter(
      this.config,
      this.fxRates,
    ).quote(input.amount, currency);
    return { ...input, amount: settlement.amount, currency, settlement };
  }

  async initialize(
    input: InitializePaymentInput,
  ): Promise<ProviderPaymentResult> {
    this.validateInput(input);
    const details = input.details!;
    const merchantId = this.config.get<string>('UNIFIED_PAYMENTS_MERCHANT_ID');
    // Every optional field is omitted rather than sent empty: the gateway
    // documents them as droppable, and an absent key is unambiguous where a
    // blank string is not.
    const callbackUrl = this.callbackUrl();
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
      ...(input.description ? { description: input.description } : {}),
      ...(callbackUrl ? { callbackUrl } : {}),
      ...(input.metadata && Object.keys(input.metadata).length
        ? { metadata: input.metadata }
        : {}),
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
    // A mobile money charge is normally still pending here — the subscriber
    // has yet to approve it — but a gateway that settles inline is honoured
    // rather than left to a later reconciliation. That includes a card
    // declined inline: the failure reason travels with it so the customer
    // sees why, rather than a payment stuck looking like it is still pending.
    return {
      providerReference: payment.paymentId,
      status: toProviderStatus(payment.status),
      gatewayStatus: payment.status,
      ...(payment.failureCode ? { failureCode: payment.failureCode } : {}),
      ...(payment.failureMessage
        ? { failureMessage: payment.failureMessage }
        : {}),
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

  /**
   * The gateway's own view of a payment.
   *
   * Reads rather than checks: `GET /payments/{id}` has no side effects, where
   * the status route is a POST the gateway may treat as an action.
   */
  async getPayment(id: string): Promise<ProviderPaymentResult> {
    const payment = await this.getDetails(id);
    return {
      providerReference: payment.paymentId,
      status: toProviderStatus(payment.status),
      gatewayStatus: payment.status,
      amount: Math.round(payment.amount * 100),
      currency: payment.currency,
      reference: payment.reference,
      failureCode: payment.failureCode,
      failureMessage: payment.failureMessage,
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
  refund(): Promise<ProviderRefundResult> {
    return Promise.reject(
      new NotImplementedException(
        'Current gateway connectors do not support refunds; a refund result contract is required before enabling them',
      ),
    );
  }

  getRefund(): Promise<ProviderRefundResult> {
    return Promise.reject(
      new NotImplementedException('Gateway refund lookup is not documented'),
    );
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
      // Optional and only kept when the gateway sends a usable string, so a
      // malformed extra field never fails an otherwise valid payment.
      ...text(value.failureCode, 'failureCode'),
      ...text(value.failureMessage, 'failureMessage'),
      ...text(value.completedAt, 'completedAt'),
      ...text(value.expiresAt, 'expiresAt'),
    };
  }

  /**
   * Where the gateway should report status changes.
   *
   * Off unless configured, and deliberately so: this API can receive a
   * callback but cannot yet verify one — the gateway's signing scheme is not
   * in its documentation — so `PaymentsController` rejects every unsigned
   * delivery. Publishing a callback URL before that is settled would only
   * invite traffic that is guaranteed to be refused.
   */
  private callbackUrl(): string | undefined {
    const configured = this.config.get<string>('UNIFIED_PAYMENTS_CALLBACK_URL');
    if (!configured) {
      return undefined;
    }

    try {
      const url = new URL(configured);
      return url.protocol === 'https:' || url.protocol === 'http:'
        ? url.toString()
        : undefined;
    } catch {
      return undefined;
    }
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
    const allowsHttp =
      ['development', 'test'].includes(
        this.config.get<string>('NODE_ENV', 'production'),
      ) || this.config.get<string>('UNIFIED_PAYMENTS_ALLOW_HTTP') === 'true';

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
          // ConfigService.get() can hand back the raw process.env string
          // (e.g. '15000') rather than the numeric default when the key is
          // set in the environment but read outside the validated
          // EnvironmentVariables class — AbortSignal.timeout() throws on
          // anything but a real number.
          Number(this.config.get('UNIFIED_PAYMENTS_TIMEOUT_MS', 15000)),
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

    // The gateway asks for this when reporting a problem with a specific
    // call, so it is worth having in our own logs rather than only theirs.
    if (typeof envelope.correlationId === 'string')
      this.logger.log(
        `${method} ${path} correlationId=${envelope.correlationId}`,
      );

    return envelope.data;
  }
}
