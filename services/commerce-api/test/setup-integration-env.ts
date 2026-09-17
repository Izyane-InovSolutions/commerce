import { config } from 'dotenv';
import { resolve } from 'node:path';

// Unlike test/setup-env.ts (used by the FakePrismaService-backed e2e suite),
// integration specs hit a real, migrated Postgres database — so this loads
// the same .env the app and `prisma migrate` use, instead of pointing at a
// throwaway commerce_test database that was never migrated.
config({ path: resolve(__dirname, '..', '.env') });
