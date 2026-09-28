import type { CheckoutResult } from './commerce-types';

/**
 * Hosts the gateway may send a shopper to for 3-D Secure or any other
 * "requires action" step, comma-separated. Server-only on purpose: the
 * redirect is decided in a server action, never in the browser.
 *
 * Fails closed: unset (or empty) means no host is accepted, and a shopper
 * whose payment wants them elsewhere lands on the order's confirmation page
 * instead. The gateway's challenge host is not documented, so which hosts to
 * trust has to be a deployment decision — but forgetting to make it must not
 * leave every `https:` host on the internet trusted.
 */
function allowedHostsFromEnv(): string[] {
  return (process.env.PAYMENT_REDIRECT_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Narrows a gateway-supplied `redirectUrl` to somewhere safe to send a
 * shopper, or null.
 *
 * The URL comes back from the API, which had it from the gateway, so it is
 * checked like any other outside input before the browser is pointed at it:
 * an absolute `https:` URL only — no `javascript:`, no `data:`, no plain
 * `http:` for a page that is about to ask for a card's one-time code — and no
 * embedded credentials, which exist mostly to make `https://bank@evil` read
 * as the bank's own address — and only to a host on the allow-list, matched
 * exactly (no subdomain wildcards).
 */
export function safePaymentRedirect(
  raw: unknown,
  allowedHosts: string[] = allowedHostsFromEnv(),
): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return null;
  }

  let url: URL;
  try {
    // No base: a relative or protocol-relative value throws here rather
    // than being resolved against this app's own origin.
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || url.hostname === '') {
    return null;
  }

  if (url.username !== '' || url.password !== '') {
    return null;
  }

  if (!allowedHosts.includes(url.hostname.toLowerCase())) {
    return null;
  }

  return url.toString();
}

/** Where the shopper lands once an order exists: the receipt page, which
 * also watches a pending payment and is where the gateway should return
 * them after a challenge (the gateway's `reference` is the order id). */
export function orderConfirmationPath(orderId: string): string {
  return `/orders/${encodeURIComponent(orderId)}/confirmation`;
}

/** Payment states that still need the shopper, or the gateway, to act. */
const AWAITING_SHOPPER = ['PENDING', 'REQUIRES_ACTION', 'PROCESSING'];

/**
 * The next stop after checkout: the gateway's challenge page when the
 * payment needs the shopper there, otherwise the order's confirmation.
 *
 * Only a payment still in flight is sent off-site: one that already
 * settled or failed has nothing left to do at the gateway, whatever URL came
 * with it. A `REQUIRES_ACTION` payment whose URL fails validation goes to the
 * confirmation page too — which says the payment is waiting on the shopper —
 * rather than anywhere the URL pointed.
 */
export function nextStepAfterCheckout(result: CheckoutResult): string {
  const inFlight = AWAITING_SHOPPER.includes(result.payment.status);
  const gateway = inFlight
    ? safePaymentRedirect(result.payment.redirectUrl)
    : null;

  if (inFlight && !gateway && result.payment.redirectUrl) {
    // Worth a line in the server log: a shopper was meant to go somewhere
    // and did not, which is either an attack or a missing allow-list entry.
    console.warn(
      `Payment ${result.payment.id} asked to redirect to a host not in PAYMENT_REDIRECT_HOSTS; sent the shopper to the order confirmation instead.`,
    );
  }

  return gateway ?? orderConfirmationPath(result.order.id);
}
