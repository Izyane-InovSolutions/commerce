import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CheckoutAttempt } from '@prisma/client';

import type { PaymentDetailsDto } from '../payments/dto/payment-details.dto';

/**
 * Bumped whenever the normalized request shape or the HMAC input changes.
 * Receipts carrying any other version are incomparable, never "different".
 */
export const CHECKOUT_FINGERPRINT_VERSION = 1;

export const CHECKOUT_FINGERPRINT_KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
export const CHECKOUT_FINGERPRINT_MIN_KEY_BYTES = 32;

export type CheckoutOperation = 'cart' | 'buy-now';

/**
 * The request a keyed checkout is identified by, built from the validated DTO
 * (after defaults), so two retries that mean the same thing compare equal.
 * Payment details are included in full: that is why the fingerprint is an
 * HMAC under a server secret, and the raw details are never persisted.
 */
export type NormalizedCartCheckout = {
  operation: 'cart';
  shippingAddressId: string;
  currency: string;
  /** null is "the whole cart"; an explicit [] is a different request. */
  itemIds: string[] | null;
  paymentDetails: PaymentDetailsDto | null;
};

export type NormalizedBuyNowCheckout = {
  operation: 'buy-now';
  offerId: string;
  quantity: number;
  shippingAddressId: string;
  currency: string;
  paymentDetails: PaymentDetailsDto | null;
};

export type NormalizedCheckoutRequest =
  | NormalizedCartCheckout
  | NormalizedBuyNowCheckout;

export type CheckoutFingerprint = {
  keyId: string;
  version: number;
  fingerprint: string;
};

export type CheckoutFingerprintReceipt = Pick<
  CheckoutAttempt,
  'fingerprint' | 'fingerprintKeyId' | 'fingerprintVersion'
>;

export function normalizeCartCheckout(request: {
  shippingAddressId: string;
  currency: string;
  itemIds?: string[];
  paymentDetails?: PaymentDetailsDto;
}): NormalizedCartCheckout {
  return {
    operation: 'cart',
    shippingAddressId: request.shippingAddressId.toLowerCase(),
    currency: request.currency,
    itemIds: request.itemIds
      ? [...new Set(request.itemIds.map((id) => id.toLowerCase()))].sort()
      : null,
    paymentDetails: request.paymentDetails ?? null,
  };
}

export function normalizeBuyNowCheckout(request: {
  offerId: string;
  quantity: number;
  shippingAddressId: string;
  currency: string;
  paymentDetails?: PaymentDetailsDto;
}): NormalizedBuyNowCheckout {
  return {
    operation: 'buy-now',
    offerId: request.offerId.toLowerCase(),
    quantity: request.quantity,
    shippingAddressId: request.shippingAddressId.toLowerCase(),
    currency: request.currency,
    paymentDetails: request.paymentDetails ?? null,
  };
}

/** Deterministic JSON: object keys sorted, undefined members dropped, arrays kept in order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Parses and checks the keyring; shared by startup validation and the
 * service so both enforce exactly the same rules. Error messages never
 * include key material.
 */
export function parseCheckoutFingerprintKeyring(
  activeKeyId: string,
  serializedKeys: string,
): { activeKeyId: string; keys: Map<string, Buffer> } {
  if (!CHECKOUT_FINGERPRINT_KEY_ID_PATTERN.test(activeKeyId))
    throw new Error(
      'CHECKOUT_FINGERPRINT_ACTIVE_KEY_ID must be 1-32 characters of A-Z, a-z, 0-9, _ or -',
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedKeys);
  } catch {
    throw new Error('CHECKOUT_FINGERPRINT_KEYS must be a JSON object');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('CHECKOUT_FINGERPRINT_KEYS must be a JSON object');
  const keys = new Map<string, Buffer>();
  for (const [keyId, rawKey] of Object.entries(parsed)) {
    const key = typeof rawKey === 'string' ? decodeBase64Strict(rawKey) : null;
    if (
      !CHECKOUT_FINGERPRINT_KEY_ID_PATTERN.test(keyId) ||
      !key ||
      key.length < CHECKOUT_FINGERPRINT_MIN_KEY_BYTES
    )
      throw new Error(
        `CHECKOUT_FINGERPRINT_KEYS contains an invalid key; each id must match ${CHECKOUT_FINGERPRINT_KEY_ID_PATTERN.source} and each value be padded base64 of at least ${CHECKOUT_FINGERPRINT_MIN_KEY_BYTES} bytes`,
      );
    keys.set(keyId, key);
  }
  if (!keys.has(activeKeyId))
    throw new Error(
      'CHECKOUT_FINGERPRINT_KEYS must contain CHECKOUT_FINGERPRINT_ACTIVE_KEY_ID',
    );
  return { activeKeyId, keys };
}

/** Rejects the lenient decodes Buffer.from accepts (stray characters, missing padding). */
function decodeBase64Strict(value: string): Buffer | null {
  const decoded = Buffer.from(value, 'base64');
  return decoded.length > 0 && decoded.toString('base64') === value
    ? decoded
    : null;
}

/**
 * Identifies a keyed checkout request without storing it. New receipts are
 * signed with the active key; older keys stay in the ring so receipts made
 * before a rotation still compare. A receipt whose key has been removed (or
 * that predates keyed fingerprints) is incomparable and is never replayed.
 */
@Injectable()
export class CheckoutFingerprintService {
  private readonly activeKeyId: string;
  private readonly activeKey: Buffer;
  private readonly keys: ReadonlyMap<string, Buffer>;

  constructor(config: ConfigService) {
    const ring = parseCheckoutFingerprintKeyring(
      config.getOrThrow<string>('CHECKOUT_FINGERPRINT_ACTIVE_KEY_ID'),
      config.getOrThrow<string>('CHECKOUT_FINGERPRINT_KEYS'),
    );
    this.activeKeyId = ring.activeKeyId;
    this.activeKey = ring.keys.get(ring.activeKeyId) as Buffer;
    this.keys = ring.keys;
  }

  compute(normalized: NormalizedCheckoutRequest): CheckoutFingerprint {
    return {
      keyId: this.activeKeyId,
      version: CHECKOUT_FINGERPRINT_VERSION,
      fingerprint: this.sign(this.activeKey, normalized),
    };
  }

  verify(
    receipt: CheckoutFingerprintReceipt,
    normalized: NormalizedCheckoutRequest,
  ): 'match' | 'mismatch' | 'incomparable' {
    if (receipt.fingerprintVersion !== CHECKOUT_FINGERPRINT_VERSION)
      return 'incomparable';
    const key =
      receipt.fingerprintKeyId === null
        ? undefined
        : this.keys.get(receipt.fingerprintKeyId);
    if (!key) return 'incomparable';
    const expected = Buffer.from(this.sign(key, normalized), 'hex');
    const actual = Buffer.from(receipt.fingerprint, 'hex');
    return actual.length === expected.length &&
      timingSafeEqual(actual, expected)
      ? 'match'
      : 'mismatch';
  }

  private sign(key: Buffer, normalized: NormalizedCheckoutRequest): string {
    return createHmac('sha256', key)
      .update(
        `checkout-fingerprint:v${CHECKOUT_FINGERPRINT_VERSION}:${canonicalJson(normalized)}`,
      )
      .digest('hex');
  }
}
