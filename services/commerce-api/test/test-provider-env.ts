/** Keep test bootstrap independent of inherited shell/application providers. */
export function configureTestProviders(env: NodeJS.ProcessEnv): void {
  env.NODE_ENV = 'test';
  env.SCHEDULED_WORKERS_ENABLED = 'false';
  env.PAYMENTS_PROVIDER = 'pending';
  env.MEDIA_STORAGE_DRIVER = 'local';
  env.AWS_EC2_METADATA_DISABLED = 'true';
  // SMTP is required by configuration validation, but tests must never send
  // through inherited real credentials. Sender tests inject mocked transports.
  env.SMTP_HOST = '127.0.0.1';
  env.SMTP_PORT = '1';
  env.SMTP_SECURE = 'false';
  env.SMTP_USER = '';
  env.SMTP_PASS = '';
  env.EMAIL_FROM = 'Commerce <no-reply@commerce.test>';
  env.CUSTOMER_WEB_URL = 'http://localhost:3001';
  env.WEB_APP_URL = 'http://localhost:3001';
  env.SELLER_APP_URL = 'http://localhost:3003/seller';
  for (const name of [
    'SMTP_URL',
    'UNIFIED_PAYMENTS_BASE_URL',
    'UNIFIED_PAYMENTS_API_KEY',
    'UNIFIED_PAYMENTS_CALLBACK_URL',
    'PAYMENT_FX_API_KEY',
    'PAYMENT_FX_QUOTES',
  ]) {
    delete env[name];
  }
}
