import { createHash, randomBytes } from 'node:crypto';

const OPAQUE_TOKEN_BYTES = 32;

export function generateOpaqueToken(): string {
  return randomBytes(OPAQUE_TOKEN_BYTES).toString('base64url');
}

// Opaque tokens (refresh / password-reset) already carry 256 bits of entropy,
// so a fast deterministic hash is appropriate here — unlike passwords, they
// don't need a slow, salted KDF, and a deterministic digest lets us look them
// up by unique index.
export function hashOpaqueToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
