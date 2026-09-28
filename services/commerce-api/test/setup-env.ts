process.env.DATABASE_URL ??=
  'postgresql://commerce:commerce@localhost:5432/commerce_test?schema=public';
process.env.NODE_ENV = 'test';
process.env.SCHEDULED_WORKERS_ENABLED = 'false';
process.env.SHADOW_DATABASE_URL ??=
  'postgresql://commerce:commerce@localhost:5432/commerce_test_shadow?schema=public';
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
process.env.SMTP_HOST ??= 'localhost';
process.env.SMTP_PORT ??= '1025';
process.env.SMTP_SECURE ??= 'false';
process.env.SMTP_USER ??= '';
process.env.SMTP_PASS ??= '';
process.env.EMAIL_FROM ??= 'Commerce <no-reply@commerce.test>';
process.env.CUSTOMER_WEB_URL ??= 'http://localhost:3001';
