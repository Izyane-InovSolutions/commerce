import { configureTestProviders } from './test-provider-env';

configureTestProviders(process.env);
// Unit/HTTP suites replace Prisma. An accidental real connection must fail.
process.env.DATABASE_URL =
  'postgresql://unused:unused@127.0.0.1:1/commerce_test';
process.env.SHADOW_DATABASE_URL =
  'postgresql://unused:unused@127.0.0.1:1/commerce_test_shadow';
process.env.PORT ??= '3000';
process.env.JWT_SECRET ??=
  'test-only-secret-value-that-is-long-enough-1234567890';
process.env.MEDIA_SIGNING_SECRET ??=
  'test-only-media-secret-that-is-long-enough-1234567890';
process.env.REFRESH_RECOVERY_ENCRYPTION_ACTIVE_KEY_ID ??= 'v1';
process.env.REFRESH_RECOVERY_ENCRYPTION_KEYS ??=
  '{"v1":"dGVzdC1vbmx5LWZpZWxkLWVuY3J5cHRpb24ta2V5ISE="}';
process.env.EMAIL_DELIVERY_ENCRYPTION_ACTIVE_KEY_ID ??= 'v1';
process.env.EMAIL_DELIVERY_ENCRYPTION_KEYS ??=
  '{"v1":"dGVzdC1vbmx5LWVtYWlsLWRlbGl2ZXJ5LWtleSEhISE="}';
