import { config } from 'dotenv';
import { resolve } from 'node:path';

import { integrationTestDatabaseUrl } from '../src/infrastructure/config/integration-test.config';
import { configureTestProviders } from './test-provider-env';

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
// Apply only after the database guard has checked the original environment.
configureTestProviders(process.env);
// migrate deploy never uses a shadow database, but Prisma rejects identical
// URLs even for deploy. An unreachable placeholder prevents accidental access
// to either the application database or an existing development shadow database.
process.env.SHADOW_DATABASE_URL =
  'postgresql://unused:unused@127.0.0.1:1/unused_integration_shadow';
process.env.JWT_SECRET ??= 'integration-test-only-jwt-secret-1234567890';
process.env.MEDIA_SIGNING_SECRET ??=
  'integration-test-only-media-secret-1234567890';
process.env.REFRESH_RECOVERY_ENCRYPTION_ACTIVE_KEY_ID ??= 'v1';
process.env.REFRESH_RECOVERY_ENCRYPTION_KEYS ??=
  '{"v1":"aW50ZWdyYXRpb24tcmVjb3Zlcnkta2V5LTAwMDAwMDE="}';
process.env.EMAIL_DELIVERY_ENCRYPTION_ACTIVE_KEY_ID ??= 'v1';
process.env.EMAIL_DELIVERY_ENCRYPTION_KEYS ??=
  '{"v1":"aW50ZWdyYXRpb24tZW1haWwta2V5LTAwMDAwMDAwMDE="}';
