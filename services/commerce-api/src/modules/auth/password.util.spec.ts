import { comparePassword, hashPassword } from './password.util';

describe('password hashing', () => {
  it('keeps the API event loop responsive while preserving bcrypt hashes', async () => {
    const hashed = hashPassword('correct-password');
    const first = await Promise.race([
      hashed.then(() => 'hash'),
      new Promise<'timer'>((resolve) => setTimeout(() => resolve('timer'), 20)),
    ]);
    expect(first).toBe('timer');
    await expect(hashed).resolves.toMatch(/^\$2[aby]\$12\$/);
    const hash = await hashed;
    await expect(comparePassword('correct-password', hash)).resolves.toBe(true);
    await expect(comparePassword('wrong-password', hash)).resolves.toBe(false);
  });
});
