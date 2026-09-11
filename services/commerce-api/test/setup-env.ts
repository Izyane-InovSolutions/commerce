process.env.DATABASE_URL ??=
  'postgresql://commerce:commerce@localhost:5432/commerce_test?schema=public';
process.env.SHADOW_DATABASE_URL ??=
  'postgresql://commerce:commerce@localhost:5432/commerce_test_shadow?schema=public';
process.env.PORT ??= '3000';
process.env.JWT_SECRET ??=
  'test-only-secret-value-that-is-long-enough-1234567890';
process.env.MEDIA_SIGNING_SECRET ??=
  'test-only-media-secret-that-is-long-enough-1234567890';
