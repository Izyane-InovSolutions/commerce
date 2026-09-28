import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutResult } from './commerce-types';
import {
  nextStepAfterCheckout,
  orderConfirmationPath,
  safePaymentRedirect,
} from './payment-redirect';

const ALLOWED = ['secure.gateway.example'];

function result(payment: CheckoutResult['payment']): CheckoutResult {
  return {
    order: {
      id: 'order-1',
      status: 'PENDING_PAYMENT',
      currency: 'ZMW',
      subtotal: 1000,
      shippingAmount: 0,
      total: 1000,
      items: [],
      createdAt: '2026-09-28T10:00:00.000Z',
    },
    payment,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('safePaymentRedirect', () => {
  it('accepts an https URL on an allow-listed host', () => {
    expect(
      safePaymentRedirect('https://secure.gateway.example/3ds?x=1', ALLOWED),
    ).toBe('https://secure.gateway.example/3ds?x=1');
  });

  it('matches the host case-insensitively', () => {
    expect(
      safePaymentRedirect('https://SECURE.Gateway.example/3ds', ALLOWED),
    ).toBe('https://secure.gateway.example/3ds');
  });

  it('fails closed when no host is allow-listed', () => {
    expect(
      safePaymentRedirect('https://secure.gateway.example/3ds', []),
    ).toBeNull();
  });

  it('reads the allow-list from PAYMENT_REDIRECT_HOSTS, and refuses everything when it is unset', () => {
    vi.stubEnv('PAYMENT_REDIRECT_HOSTS', '');
    expect(safePaymentRedirect('https://secure.gateway.example/3ds')).toBeNull();

    vi.stubEnv(
      'PAYMENT_REDIRECT_HOSTS',
      ' acs.bank.example , Secure.Gateway.Example ',
    );
    expect(safePaymentRedirect('https://secure.gateway.example/3ds')).toBe(
      'https://secure.gateway.example/3ds',
    );
    expect(safePaymentRedirect('https://acs.bank.example/')).toBe(
      'https://acs.bank.example/',
    );
  });

  it('refuses a host that is not on the list, including subdomains of one that is', () => {
    expect(safePaymentRedirect('https://evil.example/3ds', ALLOWED)).toBeNull();
    expect(
      safePaymentRedirect('https://x.secure.gateway.example/3ds', ALLOWED),
    ).toBeNull();
  });

  it('refuses anything but an absolute https URL', () => {
    expect(
      safePaymentRedirect('http://secure.gateway.example/3ds', ALLOWED),
    ).toBeNull();
    expect(safePaymentRedirect('javascript:alert(1)', ALLOWED)).toBeNull();
    expect(safePaymentRedirect('/orders/1', ALLOWED)).toBeNull();
    expect(
      safePaymentRedirect('//secure.gateway.example/3ds', ALLOWED),
    ).toBeNull();
    expect(safePaymentRedirect('', ALLOWED)).toBeNull();
    expect(safePaymentRedirect(null, ALLOWED)).toBeNull();
  });

  it('refuses embedded credentials', () => {
    expect(
      safePaymentRedirect('https://bank@secure.gateway.example/', ALLOWED),
    ).toBeNull();
  });
});

describe('nextStepAfterCheckout', () => {
  it('sends an in-flight payment to an allow-listed gateway page', () => {
    vi.stubEnv('PAYMENT_REDIRECT_HOSTS', 'secure.gateway.example');
    expect(
      nextStepAfterCheckout(
        result({
          id: 'pay-1',
          status: 'REQUIRES_ACTION',
          redirectUrl: 'https://secure.gateway.example/3ds',
        }),
      ),
    ).toBe('https://secure.gateway.example/3ds');
  });

  it('falls back to the confirmation page, and logs, when the host is not allowed', () => {
    vi.stubEnv('PAYMENT_REDIRECT_HOSTS', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(
      nextStepAfterCheckout(
        result({
          id: 'pay-1',
          status: 'REQUIRES_ACTION',
          redirectUrl: 'https://secure.gateway.example/3ds',
        }),
      ),
    ).toBe(orderConfirmationPath('order-1'));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('never sends a settled payment off-site', () => {
    vi.stubEnv('PAYMENT_REDIRECT_HOSTS', 'secure.gateway.example');
    expect(
      nextStepAfterCheckout(
        result({
          id: 'pay-1',
          status: 'SUCCEEDED',
          redirectUrl: 'https://secure.gateway.example/3ds',
        }),
      ),
    ).toBe('/orders/order-1/confirmation');
  });
});
