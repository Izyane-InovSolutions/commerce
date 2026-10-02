/**
 * Seeds a dedicated `_test` database with a deterministic synthetic dataset
 * for the Stage 6 workload (see docs/backend/performance-baseline.md).
 *
 *   LOAD_DATABASE_URL=postgresql://.../commerce_load_test?schema=public \
 *   LOAD_DATABASE_NAME=commerce_load_test \
 *   npx ts-node test/load/seed-synthetic-data.ts --reset
 *
 * The target must pass the integration-test guard (name ends in `_test`,
 * public schema). `--reset` truncates every application table first; without
 * it the script refuses to run against a database that already has users.
 * Bulk rows are generated in SQL from generate_series, so identical sizes
 * always produce the same shape: names, prices, stock skew and order mix are
 * functions of the row number, not of random().
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { integrationTestDatabaseUrl } from '../../src/infrastructure/config/integration-test.config';

export const LOAD_PASSWORD = 'load-test-password';
export const LOAD_ADMIN_EMAIL = 'load-admin@load.test';
export const loadUserEmail = (n: number): string => `load-user-${n}@load.test`;

type Sizes = { variants: number; users: number; orderLines: number };

function sizes(): Sizes {
  const read = (name: string, fallback: number): number => {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isInteger(value) || value < 1)
      throw new Error(`${name} must be a positive integer`);
    return value;
  };
  return {
    variants: read('LOAD_VARIANTS', 100_000),
    users: read('LOAD_USERS', 100_000),
    orderLines: read('LOAD_ORDER_LINES', 1_000_000),
  };
}

const ADJECTIVES = [
  'Cotton',
  'Steel',
  'Leather',
  'Bamboo',
  'Ceramic',
  'Wireless',
  'Organic',
  'Compact',
  'Classic',
  'Rugged',
  'Solar',
  'Copper',
  'Wool',
  'Glass',
  'Vintage',
  'Smart',
  'Portable',
  'Silk',
  'Oak',
  'Carbon',
];
const NOUNS = [
  'Shirt',
  'Kettle',
  'Backpack',
  'Lamp',
  'Mug',
  'Speaker',
  'Blender',
  'Jacket',
  'Charger',
  'Notebook',
  'Sandal',
  'Pan',
  'Watch',
  'Blanket',
  'Chair',
  'Bottle',
  'Radio',
  'Scarf',
  'Table',
  'Helmet',
  'Basket',
  'Torch',
  'Grinder',
  'Tent',
  'Fan',
];
const CATEGORIES = 40;

const sqlArray = (values: string[]): string =>
  `ARRAY[${values.map((v) => `'${v}'`).join(',')}]`;

async function main(): Promise<void> {
  const url = integrationTestDatabaseUrl({
    TEST_DATABASE_URL: process.env.LOAD_DATABASE_URL,
    TEST_DATABASE_NAME: process.env.LOAD_DATABASE_NAME,
  });
  const reset = process.argv.includes('--reset');
  const size = sizes();
  const products = Math.ceil(size.variants / 2);
  const orders = Math.ceil(size.orderLines / 2.5);
  const prisma = new PrismaClient({ datasourceUrl: url });
  const startedAt = Date.now();
  // Temp tables live in one session, and raw queries accept one statement
  // each, so every step runs statement by statement inside one transaction.
  let client: Pick<PrismaClient, '$executeRawUnsafe'> = prisma;
  const step = async (label: string, sql: string): Promise<void> => {
    const t = Date.now();
    for (const statement of sql.split(/;\s*(?:\n|$)/))
      if (statement.replace(/--.*$/gm, '').trim())
        await client.$executeRawUnsafe(statement);
    console.log(`${label}: ${((Date.now() - t) / 1000).toFixed(1)}s`);
  };

  try {
    const [existing] = await prisma.$queryRaw<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM users`;
    if ((existing?.count ?? 0) > 0 && !reset)
      throw new Error(
        'Target database already has users; pass --reset to truncate it',
      );
    if (reset) {
      const tables = await prisma.$queryRaw<{ name: string }[]>`
        SELECT quote_ident(tablename) AS name FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
      await step(
        'truncate',
        `TRUNCATE ${tables.map((t) => t.name).join(', ')} CASCADE`,
      );
    }

    const passwordHash = await bcrypt.hash(LOAD_PASSWORD, 12);

    await prisma.$transaction(
      async (tx) => {
        client = tx;
        await step(
          'warehouse + categories',
          `
      INSERT INTO warehouses (id, name, code, is_active, created_at, updated_at)
      VALUES (gen_random_uuid(), 'Load warehouse', 'LOAD-WH', true, now(), now());
      INSERT INTO categories (id, name, slug, position, created_at, updated_at)
      SELECT gen_random_uuid(), 'Category ' || i, 'load-category-' || i, i, now(), now()
      FROM generate_series(1, ${CATEGORIES}) i;`,
        );

        await step(
          `products (${products})`,
          `
      INSERT INTO products (id, name, slug, description, category_id, status,
        submission_status, is_returnable, created_at, updated_at)
      SELECT gen_random_uuid(),
        (${sqlArray(ADJECTIVES)})[1 + i % ${ADJECTIVES.length}] || ' ' ||
          (${sqlArray(NOUNS)})[1 + (i / ${ADJECTIVES.length}) % ${NOUNS.length}] || ' ' || i,
        'load-product-' || i,
        'Synthetic product ' || i || ' for workload measurement',
        c.id, 'PUBLISHED'::"ProductStatus", 'APPROVED'::"ProductSubmissionStatus",
        true, now() - make_interval(mins => i), now()
      FROM generate_series(1, ${products}) i
      JOIN categories c ON c.slug = 'load-category-' || (1 + i % ${CATEGORIES});`,
        );

        await step(
          `variants + offers + prices + stock (${size.variants})`,
          `
      CREATE TEMP TABLE load_variants AS
      SELECT v AS n, gen_random_uuid() AS variant_id, gen_random_uuid() AS offer_id,
        p.id AS product_id, ((v - 1) / 2) + 1 AS product_n
      FROM generate_series(1, ${size.variants}) v
      JOIN products p ON p.slug = 'load-product-' || (((v - 1) / 2) + 1);

      INSERT INTO product_variants (id, product_id, sku_code, name, status, created_at, updated_at)
      SELECT variant_id, product_id, 'LOAD-' || n, 'Variant ' || (1 + (n - 1) % 2),
        'PUBLISHED'::"ProductStatus", now(), now()
      FROM load_variants;

      INSERT INTO offers (id, variant_id, condition, stock_source, fulfillment_mode,
        version, status, created_at, updated_at)
      SELECT offer_id, variant_id, 'NEW'::"OfferCondition", 'PLATFORM'::"OfferStockSource",
        'PLATFORM'::"OfferFulfillmentMode", 0, 'PUBLISHED'::"ProductStatus", now(), now()
      FROM load_variants;

      INSERT INTO prices (id, offer_id, amount, currency, starts_at, created_at)
      SELECT gen_random_uuid(), offer_id, 1000 + (n * 7919) % 99000, 'ZMW',
        now() - interval '30 days', now()
      FROM load_variants;

      -- Every tenth variant is nearly sold out; the rest have 50-500 units.
      INSERT INTO inventory_records (id, warehouse_id, variant_id, on_hand, reserved,
        reorder_point, version, created_at, updated_at)
      SELECT gen_random_uuid(), (SELECT id FROM warehouses WHERE code = 'LOAD-WH'),
        variant_id, CASE WHEN n % 10 = 0 THEN n % 6 ELSE 50 + n % 451 END, 0, 0, 0,
        now(), now()
      FROM load_variants;`,
        );

        await step(
          `users + addresses (${size.users} + admin)`,
          `
      INSERT INTO users (id, email, password_hash, first_name, last_name, role,
        is_active, email_verified_at, created_at, updated_at)
      SELECT gen_random_uuid(), 'load-user-' || i || '@load.test', '${passwordHash}',
        'Load', 'User ' || i, 'CUSTOMER'::"Role", true, now(), now(), now()
      FROM generate_series(1, ${size.users}) i;
      INSERT INTO users (id, email, password_hash, first_name, role, is_active,
        email_verified_at, created_at, updated_at)
      VALUES (gen_random_uuid(), '${LOAD_ADMIN_EMAIL}', '${passwordHash}', 'Load admin',
        'ADMIN'::"Role", true, now(), now(), now());

      INSERT INTO addresses (id, user_id, label, recipient_name, phone, line1, city,
        postal_code, country, is_default, created_at, updated_at)
      SELECT gen_random_uuid(), id, 'Home', first_name || ' ' || last_name,
        '+260970000000', 'Plot ' || substr(id::text, 1, 6), 'Lusaka', '10101', 'ZM',
        true, now(), now()
      FROM users WHERE role = 'CUSTOMER';`,
        );

        await step(
          `orders + seller orders + lines + payments (${orders} orders, ~${size.orderLines} lines)`,
          `
      CREATE TEMP TABLE load_users AS
      SELECT row_number() OVER (ORDER BY email) AS rn, u.id, a.recipient_name
      FROM users u JOIN addresses a ON a.user_id = u.id WHERE u.role = 'CUSTOMER';
      CREATE INDEX ON load_users (rn);
      CREATE INDEX ON load_variants (n);

      -- 92% paid, 5% cancelled, 3% refunded; spread over 180 days.
      CREATE TEMP TABLE load_orders AS
      SELECT o AS n, gen_random_uuid() AS id, gen_random_uuid() AS seller_order_id,
        u.id AS user_id, u.recipient_name,
        CASE WHEN o % 100 < 92 THEN 'PAID' WHEN o % 100 < 97 THEN 'CANCELLED'
          ELSE 'REFUNDED' END AS status,
        now() - make_interval(mins => (o * 37) % 259200) AS created_at
      FROM generate_series(1, ${orders}) o
      JOIN load_users u ON u.rn = 1 + (o::bigint * 7919) % ${size.users};

      -- Cubic skew: low-numbered offers are the best sellers.
      CREATE TEMP TABLE load_lines AS
      SELECT o.id AS order_id, o.seller_order_id, o.created_at, lv.offer_id,
        1 + (o.n + j) % 3 AS quantity, 1000 + (lv.n * 7919) % 99000 AS unit_amount
      FROM load_orders o
      CROSS JOIN LATERAL generate_series(1, 1 + o.n % 4) j
      JOIN load_variants lv ON lv.n = 1 + floor(${size.variants - 1} *
        power(((o.n * 31 + j * 17) % 1000) / 1000.0, 3))::int;

      CREATE TEMP TABLE load_totals AS
      SELECT order_id, sum(quantity * unit_amount)::int AS subtotal
      FROM load_lines GROUP BY order_id;

      INSERT INTO orders (id, user_id, status, currency, subtotal, shipping_amount,
        total, shipping_address, created_at, updated_at)
      SELECT o.id, o.user_id, o.status::"OrderStatus", 'ZMW', t.subtotal, 3000,
        t.subtotal + 3000,
        jsonb_build_object('recipientName', o.recipient_name, 'line1', 'Plot 1',
          'city', 'Lusaka', 'postalCode', '10101', 'country', 'ZM'),
        o.created_at, o.created_at
      FROM load_orders o JOIN load_totals t ON t.order_id = o.id;

      INSERT INTO seller_orders (id, order_id, status, subtotal, shipping_amount, total,
        refunded_amount, currency, created_at, updated_at)
      SELECT o.seller_order_id, o.id, o.status::"OrderStatus", t.subtotal, 3000,
        t.subtotal + 3000, CASE WHEN o.status = 'REFUNDED' THEN t.subtotal + 3000 ELSE 0 END,
        'ZMW', o.created_at, o.created_at
      FROM load_orders o JOIN load_totals t ON t.order_id = o.id;

      INSERT INTO order_items (id, order_id, seller_order_id, offer_id, quantity,
        unit_amount, currency, line_total, created_at)
      SELECT gen_random_uuid(), order_id, seller_order_id, offer_id, quantity,
        unit_amount, 'ZMW', quantity * unit_amount, created_at
      FROM load_lines;

      INSERT INTO payments (id, order_id, provider, status, amount, refunded_amount,
        currency, idempotency_key, created_at, updated_at)
      SELECT gen_random_uuid(), o.id, 'pending',
        (CASE o.status WHEN 'PAID' THEN 'SUCCEEDED' WHEN 'REFUNDED' THEN 'REFUNDED'
          ELSE 'FAILED' END)::"PaymentStatus",
        t.subtotal + 3000, CASE WHEN o.status = 'REFUNDED' THEN t.subtotal + 3000 ELSE 0 END,
        'ZMW', o.id::text, o.created_at, o.created_at
      FROM load_orders o JOIN load_totals t ON t.order_id = o.id;`,
        );
      },
      { maxWait: 10_000, timeout: 60 * 60 * 1000 },
    );
    client = prisma;

    await step('analyze', 'ANALYZE');

    const counts = await prisma.$queryRaw<{ table: string; rows: number }[]>`
      SELECT t AS table, (xpath('/row/c/text()',
        query_to_xml('SELECT count(*) AS c FROM ' || t, false, true, '')))[1]::text::int AS rows
      FROM unnest(ARRAY['products', 'product_variants', 'offers', 'inventory_records',
        'users', 'addresses', 'orders', 'order_items', 'payments']) t`;
    const settings = await prisma.$queryRaw<
      { name: string; setting: string }[]
    >`
      SELECT name, current_setting(name) AS setting FROM pg_settings
      WHERE name IN ('server_version', 'max_connections', 'shared_buffers',
        'work_mem', 'effective_cache_size', 'maintenance_work_mem',
        'random_page_cost', 'synchronous_commit', 'max_wal_size')`;
    const [dbSize] = await prisma.$queryRaw<{ bytes: string }[]>`
      SELECT pg_database_size(current_database())::text AS bytes`;

    const report = {
      seededAt: new Date().toISOString(),
      revision: gitRevision(),
      requested: { ...size, products, orders },
      rows: Object.fromEntries(counts.map((c) => [c.table, c.rows])),
      databaseSizeBytes: Number(dbSize?.bytes),
      databaseSettings: Object.fromEntries(
        settings.map((s) => [s.name, s.setting]),
      ),
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
    };
    const output = resolve(
      process.env.LOAD_SEED_REPORT ?? 'load-results/seed-report.json',
    );
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

function gitRevision(): string {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'])
      .toString()
      .trim();
    const dirty = execFileSync('git', ['status', '--porcelain'])
      .toString()
      .trim();
    return dirty ? `${sha}+uncommitted` : sha;
  } catch {
    return 'unknown';
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
