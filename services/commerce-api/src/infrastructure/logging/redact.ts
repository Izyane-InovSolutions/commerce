const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'token',
  'refreshtoken',
  'accesstoken',
  'authorization',
  'secret',
  'card',
  'securitycode',
  'cvv',
  'pan',
  'phonenumber',
  'paymentdetails',
  'x-api-key',
  'apikey',
  'unified_payments_api_key',
]);

const REDACTED = '[REDACTED]';

export function redact<T>(value: T): T {
  return redactValue(value, new WeakSet()) as T;
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  if (value instanceof Date || value instanceof Error) {
    return value;
  }

  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) {
      return '[CIRCULAR]';
    }

    seen.add(value);

    const result: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      result[key] = SENSITIVE_KEYS.has(key.toLowerCase())
        ? REDACTED
        : redactValue(entry, seen);
    }

    return result;
  }

  return value;
}
