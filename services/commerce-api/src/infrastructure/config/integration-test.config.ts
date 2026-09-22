/** Fail closed before any test connects to or cleans up a database. */
export function integrationTestDatabaseUrl(
  env: Record<string, string | undefined>,
): string {
  const useApplication =
    env.INTEGRATION_DATABASE_MODE === 'disposable-development';
  const raw = useApplication ? env.DATABASE_URL : env.TEST_DATABASE_URL;
  const approvedName = useApplication
    ? env.INTEGRATION_DATABASE_NAME
    : env.TEST_DATABASE_NAME;
  if (useApplication && env.NODE_ENV === 'production') {
    throw new Error('Integration tests cannot use a production environment');
  }
  if (
    !raw ||
    !approvedName ||
    !(useApplication ? /^[a-z0-9_]+$/ : /^[a-z0-9_]+_test$/).test(approvedName)
  ) {
    throw new Error(
      'Integration tests require TEST_DATABASE_URL and TEST_DATABASE_NAME ending in _test',
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid integration database URL');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    (useApplication &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) ||
    decodeURIComponent(url.pathname.slice(1)) !== approvedName ||
    (url.searchParams.has('schema') &&
      url.searchParams.get('schema') !== 'public')
  ) {
    throw new Error(
      'Integration database does not match the approved test database',
    );
  }
  return raw;
}
