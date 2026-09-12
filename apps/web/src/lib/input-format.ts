function onlyDigits(value: string, max: number): string {
  return value.replace(/\D/g, '').slice(0, max);
}

/** The standard 16-digit card number, grouped in 4s: "4242 4242 4242 4242". */
export function formatCardNumber(value: string): string {
  const digits = onlyDigits(value, 16);
  return (digits.match(/.{1,4}/g) ?? []).join(' ');
}

function clampMonth(digits: string): string {
  const month = Math.min(12, Math.max(1, Number(digits) || 0));
  return String(month).padStart(2, '0');
}

/**
 * "MM/YYYY", clamping the month to 01–12 as soon as both its digits are typed.
 *
 * A four-digit year rather than two because that is what the payment gateway
 * takes (`expiryYear` must match `20\d{2}`), so what is typed goes straight
 * through with no century to infer.
 *
 * Needs the previous value to tell typing from deleting: without that, a
 * user backspacing right after "MM/" would have the "/" immediately
 * reinserted, and get stuck unable to delete past it.
 */
export function formatExpiry(value: string, previousValue: string): string {
  const digits = onlyDigits(value, 6);
  const deleting = value.length < previousValue.length;

  if (digits.length < 2 || (digits.length === 2 && deleting)) {
    return digits;
  }

  const month = clampMonth(digits.slice(0, 2));
  const year = digits.slice(2);
  return year ? `${month}/${year}` : `${month}/`;
}

/** The card verification code: three digits, or four on Amex. */
export function formatCvc(value: string): string {
  return onlyDigits(value, 4);
}

/** Zambian mobile numbers: 10 digits starting with 0, grouped as "0XX XXX XXXX". */
export function formatZambianPhone(value: string): string {
  const digits = onlyDigits(value, 10);
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)]
    .filter(Boolean)
    .join(' ');
}
