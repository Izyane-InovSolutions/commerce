import { randomBytes } from 'node:crypto';

import { decryptField, encryptField } from './field-encryption.util';

describe('field encryption', () => {
  const key = randomBytes(32).toString('base64');
  const keyring = { activeKeyId: 'v1', keys: { v1: key } };

  it('round-trips with the matching authenticated context', () => {
    const encrypted = encryptField('sensitive value', keyring, 'session:one');

    expect(decryptField(encrypted, keyring, 'session:one')).toBe(
      'sensitive value',
    );
    expect(encrypted).not.toContain('sensitive value');
  });

  it('cannot move ciphertext to another record or purpose', () => {
    const encrypted = encryptField('sensitive value', keyring, 'session:one');

    expect(() => decryptField(encrypted, keyring, 'session:two')).toThrow();
    expect(() => decryptField(encrypted, keyring, 'email:one')).toThrow();
  });

  it('rejects ciphertext tampering', () => {
    const encrypted = encryptField('sensitive value', keyring, 'session:one');
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith('A') ? 'B' : 'A'}`;

    expect(() => decryptField(tampered, keyring, 'session:one')).toThrow();
  });

  it('decrypts older ciphertext after the active key rotates', () => {
    const encrypted = encryptField('sensitive value', keyring, 'session:one');
    const rotated = {
      activeKeyId: 'v2',
      keys: { v1: key, v2: randomBytes(32).toString('base64') },
    };

    expect(decryptField(encrypted, rotated, 'session:one')).toBe(
      'sensitive value',
    );
  });
});
