import { integrationTestDatabaseUrl } from './integration-test.config';

describe('integration database safety', () => {
  const safe = {
    TEST_DATABASE_URL: 'postgresql://tester:secret@localhost/commerce_test',
    TEST_DATABASE_NAME: 'commerce_test',
  };
  it('accepts an explicitly approved test database', () => {
    expect(integrationTestDatabaseUrl(safe)).toBe(safe.TEST_DATABASE_URL);
  });
  const development = {
    INTEGRATION_DATABASE_MODE: 'disposable-development',
    INTEGRATION_DATABASE_NAME: 'commerce',
    DATABASE_URL: 'postgresql://tester:secret@localhost/commerce',
    NODE_ENV: 'test',
  };
  it('supports explicitly confirmed disposable local application databases', () => {
    expect(integrationTestDatabaseUrl(development)).toBe(
      development.DATABASE_URL,
    );
  });
  it.each([
    { ...development, INTEGRATION_DATABASE_NAME: undefined },
    { ...development, INTEGRATION_DATABASE_NAME: 'another' },
    { ...development, INTEGRATION_DATABASE_MODE: undefined },
    { ...development, NODE_ENV: 'production' },
    {
      ...development,
      DATABASE_URL: 'postgresql://tester:secret@remote.example/commerce',
    },
  ])('rejects unconfirmed, remote or production application targets', (env) => {
    expect(() => integrationTestDatabaseUrl(env)).toThrow();
  });
  it.each([
    {},
    { DATABASE_URL: safe.TEST_DATABASE_URL },
    { ...safe, TEST_DATABASE_NAME: 'commerce' },
    { ...safe, TEST_DATABASE_URL: 'postgresql://localhost/production' },
    { ...safe, TEST_DATABASE_URL: 'postgresql://localhost/other_test' },
    { ...safe, TEST_DATABASE_URL: `${safe.TEST_DATABASE_URL}?schema=live` },
    { ...safe, TEST_DATABASE_URL: 'not-a-url' },
  ])('rejects unsafe configuration without exposing credentials', (env) => {
    expect(() => integrationTestDatabaseUrl(env)).toThrow();
    try {
      integrationTestDatabaseUrl(env);
    } catch (error) {
      expect(String(error)).not.toContain('secret');
    }
  });
});
