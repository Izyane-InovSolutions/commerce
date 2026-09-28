import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

export type FieldEncryptionKeyring = {
  activeKeyId: string;
  keys: Readonly<Record<string, string>>;
};

// Same joined-string convention as token.util.ts's opaque tokens, so the
// result round-trips through a single `String` database column.
function loadKey(rawKey: string): Buffer {
  const key = Buffer.from(rawKey, 'base64');

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `Field-encryption key must decode to exactly ${KEY_BYTES} bytes (got ${key.length})`,
    );
  }

  return key;
}

export function encryptField(
  plaintext: string,
  keyring: FieldEncryptionKeyring,
  authenticatedContext: string,
): string {
  const rawKey = keyring.keys[keyring.activeKeyId];
  if (!rawKey || keyring.activeKeyId.includes(':')) {
    throw new Error('Invalid active field-encryption key');
  }
  const key = loadKey(rawKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(authenticatedContext, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    keyring.activeKeyId,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptField(
  payload: string,
  keyring: FieldEncryptionKeyring,
  authenticatedContext: string,
): string {
  const [keyId, ivPart, authTagPart, ciphertextPart] = payload.split(':');

  if (!keyId || !ivPart || !authTagPart || !ciphertextPart) {
    throw new Error('Malformed encrypted field payload');
  }
  const rawKey = keyring.keys[keyId];
  if (!rawKey) throw new Error(`Unknown field-encryption key id: ${keyId}`);
  const key = loadKey(rawKey);

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivPart, 'base64url'),
  );
  decipher.setAAD(Buffer.from(authenticatedContext, 'utf8'));
  decipher.setAuthTag(Buffer.from(authTagPart, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
