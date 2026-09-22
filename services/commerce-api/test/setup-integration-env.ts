import { config } from 'dotenv';
import { resolve } from 'node:path';

import { integrationTestDatabaseUrl } from '../src/infrastructure/config/integration-test.config';

// The application database requires an explicit opt-in and exact local database
// name. It is never selected as a fallback for missing test configuration.
const useApplication =
  process.env.INTEGRATION_DATABASE_MODE === 'disposable-development';
const loaded = config({
  path: resolve(__dirname, '..', useApplication ? '.env' : '.env.integration'),
});
if (useApplication && loaded.parsed?.NODE_ENV === 'production') {
  throw new Error(
    'Refusing production application configuration for integration tests',
  );
}

process.env.DATABASE_URL = integrationTestDatabaseUrl(process.env);
process.env.NODE_ENV = 'test';
process.env.SCHEDULED_WORKERS_ENABLED = 'false';
// migrate deploy never uses a shadow database, but Prisma rejects identical
// URLs even for deploy. An unreachable placeholder prevents accidental access
// to either the application database or an existing development shadow database.
process.env.SHADOW_DATABASE_URL =
  'postgresql://unused:unused@127.0.0.1:1/unused_integration_shadow';
process.env.JWT_SECRET ??= 'integration-test-only-jwt-secret-1234567890';
process.env.MEDIA_SIGNING_SECRET ??=
  'integration-test-only-media-secret-1234567890';
process.env.PAYMENTS_PROVIDER = 'pending';
