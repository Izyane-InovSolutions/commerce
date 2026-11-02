/*
 * Stage 7 migration preflight. Reports every row that would make
 * 20261008000000_transactional_shopping (unique default address per user,
 * cart_items.quantity > 0) or the DO block in
 * 20261015090000_checkout_attempt_receipts fail, grouped per check.
 *
 *   DATABASE_URL=postgresql://... node scripts/check-transactional-shopping-preflight.cjs
 *
 * Also reports, as a WARNING that does not affect the exit code, users with
 * addresses but no default (no migration fails on them; the application
 * repairs them on the next address create/remove).
 *
 * Exit codes: 0 nothing found (warnings allowed), 1 offending rows found,
 * 2 could not run.
 * Read-only: every query runs inside one READ ONLY, REPEATABLE READ
 * transaction, so the report is a single consistent snapshot and PostgreSQL
 * itself rejects any write. Repair reported rows deliberately; this script
 * never changes data. Checks on tables or columns that a not-yet-applied
 * migration creates are skipped (nothing can violate them yet).
 */
const { PrismaClient } = require('@prisma/client');

const CHECKS = [
  {
    title: 'users with more than one default address',
    migration: '20261008000000 (addresses_one_default_per_user)',
    async run(tx) {
      const rows = await tx.$queryRaw`
        SELECT user_id::text AS user_id,
               array_agg(id::text ORDER BY id) AS ids
          FROM addresses
         WHERE is_default
         GROUP BY user_id
        HAVING count(*) > 1
         ORDER BY user_id`;
      return rows.map((r) => `user ${r.user_id}: ${r.ids.join(', ')}`);
    },
  },
  {
    title: 'cart_items with non-positive quantity or negative revision',
    migration:
      '20261008000000 (cart_items_quantity_positive) / 20261015090000 (cart_items_revision_nonnegative)',
    async run(tx, schema) {
      // revision arrives with 20261008000000; before that only quantity applies.
      const rows = schema.hasColumn('cart_items', 'revision')
        ? await tx.$queryRaw`
            SELECT id::text AS id, cart_id::text AS cart_id, quantity, revision
              FROM cart_items
             WHERE quantity <= 0 OR revision < 0
             ORDER BY id`
        : await tx.$queryRaw`
            SELECT id::text AS id, cart_id::text AS cart_id, quantity, NULL::int AS revision
              FROM cart_items
             WHERE quantity <= 0
             ORDER BY id`;
      return rows.map(
        (r) =>
          `${r.id} (cart ${r.cart_id}, quantity ${r.quantity}` +
          (r.revision === null ? ')' : `, revision ${r.revision})`),
      );
    },
  },
  {
    title: 'checkout_attempts referencing missing users',
    migration: '20261015090000 (checkout_attempts_user_id_fkey)',
    requiresTable: 'checkout_attempts',
    async run(tx) {
      const rows = await tx.$queryRaw`
        SELECT a.id::text AS id, a.user_id::text AS user_id
          FROM checkout_attempts a
         WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.user_id)
         ORDER BY a.id`;
      return rows.map((r) => `${r.id} (user ${r.user_id})`);
    },
  },
  {
    title: 'checkout_attempts referencing missing or foreign orders',
    migration: '20261015090000 (checkout_attempts_order_id_fkey)',
    requiresTable: 'checkout_attempts',
    async run(tx) {
      const rows = await tx.$queryRaw`
        SELECT a.id::text AS id, a.order_id::text AS order_id,
               (o.id IS NULL) AS missing
          FROM checkout_attempts a
          LEFT JOIN orders o ON o.id = a.order_id
         WHERE a.order_id IS NOT NULL
           AND (o.id IS NULL OR o.user_id <> a.user_id)
         ORDER BY a.id`;
      return rows.map(
        (r) =>
          `${r.id} (order ${r.order_id} ${r.missing ? 'missing' : 'belongs to another user'})`,
      );
    },
  },
  {
    title: 'checkout_attempts with an invalid recorded outcome',
    migration:
      '20261015090000 (checkout_attempts_operation_check / checkout_attempts_outcome_check)',
    requiresTable: 'checkout_attempts',
    async run(tx) {
      const rows = await tx.$queryRaw`
        SELECT id::text AS id, operation, status,
               (response IS NULL) AS no_response,
               order_id::text AS order_id, error_status
          FROM checkout_attempts
         WHERE operation NOT IN ('cart', 'buy-now')
            OR (status = 'COMPLETED' AND (response IS NULL OR order_id IS NULL))
            OR (status = 'REJECTED' AND (response IS NULL OR error_status IS NULL
                                         OR error_status NOT BETWEEN 400 AND 599))
         ORDER BY id`;
      return rows.map(
        (r) =>
          `${r.id} (operation ${JSON.stringify(r.operation)}, status ${r.status}` +
          `, response ${r.no_response ? 'missing' : 'present'}` +
          `, order ${r.order_id ?? 'none'}, error_status ${r.error_status ?? 'none'})`,
      );
    },
  },
  {
    // No migration fails on this, but it breaks "exactly one default whenever
    // addresses remain". AddressesService promotes the most recently updated
    // address on the user's next address create/remove, or setDefault fixes it.
    title: 'users with addresses but no default address',
    migration: 'none (repaired by AddressesService on the next create/remove)',
    warning: true,
    async run(tx) {
      const rows = await tx.$queryRaw`
        SELECT user_id::text AS user_id, count(*)::int AS addresses
          FROM addresses
         GROUP BY user_id
        HAVING NOT bool_or(is_default)
         ORDER BY user_id`;
      return rows.map((r) => `user ${r.user_id}: ${r.addresses} address(es)`);
    },
  },
];

async function readSchema(tx) {
  const columns = await tx.$queryRaw`
    SELECT table_name::text AS table_name, column_name::text AS column_name
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name IN ('addresses', 'cart_items', 'checkout_attempts', 'orders', 'users')`;
  const tables = new Map();
  for (const { table_name, column_name } of columns) {
    if (!tables.has(table_name)) tables.set(table_name, new Set());
    tables.get(table_name).add(column_name);
  }
  return {
    hasTable: (table) => tables.has(table),
    hasColumn: (table, column) => tables.get(table)?.has(column) ?? false,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    return 2;
  }

  const prisma = new PrismaClient();
  try {
    const results = await prisma.$transaction(
      async (tx) => {
        // Must be the first statement of the transaction.
        await tx.$executeRawUnsafe(
          'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
        );
        const schema = await readSchema(tx);
        for (const table of ['addresses', 'cart_items']) {
          if (!schema.hasTable(table)) {
            throw new Error(
              `table "${table}" not found in the current schema; is DATABASE_URL pointing at the commerce database?`,
            );
          }
        }

        const out = [];
        for (const check of CHECKS) {
          if (check.requiresTable && !schema.hasTable(check.requiresTable)) {
            out.push({ check, skipped: true, offending: [] });
            continue;
          }
          out.push({
            check,
            skipped: false,
            offending: await check.run(tx, schema),
          });
        }
        return out;
      },
      // Tooling, not a request path: allow full-table scans on large data.
      { maxWait: 30_000, timeout: 600_000 },
    );

    let found = 0;
    let warnings = 0;
    for (const { check, skipped, offending } of results) {
      if (skipped) {
        console.log(
          `SKIP  ${check.title}: table ${check.requiresTable} does not exist yet`,
        );
        continue;
      }
      if (offending.length === 0) {
        console.log(`OK    ${check.title}`);
        continue;
      }
      if (check.warning) {
        warnings += offending.length;
        console.log(
          `WARN  ${check.title} [${check.migration}]: ${offending.length}`,
        );
        for (const line of offending) console.log(`        ${line}`);
        continue;
      }
      found += offending.length;
      console.log(
        `FAIL  ${check.title} [${check.migration}]: ${offending.length}`,
      );
      for (const line of offending) console.log(`        ${line}`);
    }

    if (found > 0) {
      console.log(
        `\nStage 7 preflight found ${found} offending row(s). Repair them deliberately, then rerun before deploying.`,
      );
      return 1;
    }
    if (warnings > 0) {
      console.log(
        `\nStage 7 preflight passed with ${warnings} warning(s); they do not block deployment.`,
      );
      return 0;
    }
    console.log('\nStage 7 preflight passed.');
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(
      `Stage 7 preflight could not run: ${error?.message ?? error}`,
    );
    process.exitCode = 2;
  },
);
