/** Splits one typed name into the two the gateway's billing block wants. */
function splitName(holderName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = holderName.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? holderName,
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] ?? ''),
  };
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

/**
 * Builds the payment details the API expects from what was typed.
 *
 * The billing block is asked for rather than taken from the shipping address:
 * the card processor matches it against the issuer's record, and the address
 * an order ships to is often not the one the card is registered at. Every
 * field it requires has its own input, so nothing is inferred.
 *
 * None of it is stored here — it is passed straight through to the API, which
 * hands it to the gateway.
 *
 * Shared by every checkout flow (cart and buy-now) since both post the same
 * `CheckoutForm`.
 */
export function buildPaymentDetails(
  formData: FormData,
): Record<string, unknown> | undefined {
  const method = field(formData, 'paymentMethod');

  if (method === 'mobile-money') {
    return {
      paymentMethod: 'MOBILE_MONEY',
      phoneNumber: field(formData, 'momoPhone').replace(/\s+/g, ''),
      provider: field(formData, 'momoProvider') || undefined,
    };
  }

  if (method !== 'card') {
    return undefined;
  }

  // Typed as "MM/YY", the same two-digit year printed on the card — the
  // gateway wants four (`expiryYear` must match `20\d{2}`), so the century
  // is assumed here rather than asked for twice.
  const [expiryMonth = '', expiryYearShort = ''] = field(
    formData,
    'cardExpiry',
  ).split('/');
  const expiryYear = expiryYearShort ? `20${expiryYearShort}` : '';
  const { firstName, lastName } = splitName(field(formData, 'cardName'));

  return {
    paymentMethod: 'CARD',
    card: {
      number: field(formData, 'cardNumber').replace(/\s+/g, ''),
      expiryMonth,
      expiryYear,
      securityCode: field(formData, 'cardCvc'),
      holderName: field(formData, 'cardName'),
      billing: {
        firstName,
        lastName,
        address1: field(formData, 'billingAddress1'),
        locality: field(formData, 'billingCity'),
        administrativeArea: field(formData, 'billingState'),
        postalCode: field(formData, 'billingPostalCode'),
        country: field(formData, 'billingCountry').toUpperCase(),
        email: field(formData, 'billingEmail'),
      },
    },
  };
}
