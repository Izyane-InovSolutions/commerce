// Launch the built API against an explicitly named, disposable load database.
// Apply the existing test-provider isolation before importing the application;
// Prisma also reads .env, so use local dummy values for provider settings
// whose optional validators reject an empty string.
require('ts-node/register');
require('../setup-env.ts');

const { integrationTestDatabaseUrl } = require('../../src/infrastructure/config/integration-test.config.ts');
const url = integrationTestDatabaseUrl({
  TEST_DATABASE_URL: process.env.LOAD_DATABASE_URL,
  TEST_DATABASE_NAME: process.env.LOAD_DATABASE_NAME,
});
process.env.DATABASE_URL = url;
process.env.SHADOW_DATABASE_URL = url;
process.env.PORT = process.env.LOAD_API_PORT || '3100';
process.env.SCHEDULED_WORKERS_ENABLED = 'true';
process.env.PAYMENT_FX_API_KEY = 'load-test-disabled';
process.env.UNIFIED_PAYMENTS_BASE_URL = 'http://127.0.0.1:1';
process.env.UNIFIED_PAYMENTS_API_KEY = 'load-test-disabled';
process.env.UNIFIED_PAYMENTS_CALLBACK_URL = 'http://127.0.0.1:1/callback';

require('../../dist/main.js');
