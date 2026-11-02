import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

// Each scenario runs `prisma migrate deploy` over the whole history several
// times against its own scratch database.
jest.setTimeout(300_000);

const API_ROOT = resolve(__dirname, '..');
const MIGRATIONS_DIR = join(API_ROOT, 'prisma', 'migrations');
const PRISMA_CLI = require.resolve('prisma/build/index.js');
const PREFLIGHT = join(
  API_ROOT,
  'scripts',
  'check-transactional-shopping-preflight.cjs',
);
const SHOPPING = '20261008000000_transactional_shopping';
const RECEIPTS = '20261015090000_checkout_attempt_receipts';
// migrate deploy never uses a shadow database; an unreachable placeholder
// keeps it away from any real one (same rule as setup-integration-env.ts).
const UNUSED_SHADOW =
  'postgresql://unused:unused@127.0.0.1:1/unused_migration_shadow';
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const SEEDED_AT = '2026-09-01 10:00:00';

type MigrationSet = { schema: string; migrations: string[] };
type CliResult = { status: number | null; output: string };
type TableRows = Record<string, Record<string, unknown>>;
type DataState = Record<string, TableRows>;
type SchemaState = {
  columns: string[];
  constraints: string[];
  indexes: string[];
};
type HistoryRow = { name: string; finished: boolean; rolledBack: boolean };

/** Tables whose rows a migration must never delete or rewrite. */
const DATA_TABLES = [
  'users',
  'addresses',
  'carts',
  'cart_items',
  'orders',
  'payments',
  'reservations',
  'inventory_records',
  'offers',
  'product_variants',
  'products',
  'warehouses',
  'checkout_attempts',
];

/**
 * Columns the Stage 7 migrations add to existing tables, with the value every
 * pre-existing row must get. Nothing else on an existing row may change.
 */
const STAGE7_ADDED_COLUMNS: Record<string, Record<string, unknown>> = {
  cart_items: { revision: 0 },
  orders: { checkout_cart_snapshot: null },
  checkout_attempts: {
    fingerprint_key_id: null,
    fingerprint_version: null,
    stage: 'RECEIVED',
    owner_token: null,
    lease_expires_at: null,
    completed_at: null,
  },
};

/**
 * Stage 7 migrations against real PostgreSQL: fresh install, upgrade of
 * representative pre-Stage-7 data, and the documented failure + forward-repair
 * path for invalid legacy data.
 *
 * Every scenario creates its own scratch database (name ending in _test) on
 * the server behind TEST_DATABASE_URL and drops it afterwards; the test
 * database itself is only used as the admin connection for CREATE/DROP
 * DATABASE, and none of its rows are read or written. Partial migration
 * histories are deployed from copies of prisma/ under os.tmpdir(), so the
 * repository's migrations directory is never modified.
 */
describe('Stage 7 migrations (integration, real Postgres)', () => {
  const adminUrl = process.env.DATABASE_URL!;
  const adminDatabase = decodeURIComponent(new URL(adminUrl).pathname.slice(1));
  const scratchDatabases: string[] = [];
  let admin: PrismaClient;
  let workDir: string;
  let sets: { pre: MigrationSet; shopping: MigrationSet; full: MigrationSet };

  beforeAll(async () => {
    admin = new PrismaClient({ datasourceUrl: adminUrl });
    await admin.$connect();
    workDir = mkdtempSync(join(tmpdir(), 'stage7-migrations-'));
    sets = {
      // Everything before Stage 7: the state production is upgraded from.
      pre: buildMigrationSet(workDir, 'pre', (name) => name < SHOPPING),
      // The committed draft migration only: where the 20261015090000 preflight
      // can meet draft-era checkout_attempts rows.
      shopping: buildMigrationSet(
        workDir,
        'shopping',
        (name) => name <= SHOPPING,
      ),
      full: buildMigrationSet(workDir, 'full', () => true),
    };
    expect(sets.full.migrations).toEqual(
      expect.arrayContaining([SHOPPING, RECEIPTS]),
    );
    expect(sets.pre.migrations).not.toContain(SHOPPING);
    expect(sets.shopping.migrations).toContain(SHOPPING);
    expect(sets.shopping.migrations).not.toContain(RECEIPTS);
  });

  afterAll(async () => {
    for (const name of scratchDatabases) {
      await admin.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
      );
    }
    await admin?.$disconnect();
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  async function createScratchDatabase(label: string): Promise<string> {
    const name = `stage7_${label}_${randomBytes(4).toString('hex')}_test`;
    if (!/^[a-z0-9_]{1,63}$/.test(name) || name === adminDatabase) {
      throw new Error(`Refusing scratch database name ${name}`);
    }
    // template0 never accepts connections, so concurrent CREATE DATABASE
    // calls from other suites cannot make the copy fail.
    await admin.$executeRawUnsafe(
      `CREATE DATABASE "${name}" TEMPLATE template0`,
    );
    scratchDatabases.push(name);
    const url = new URL(adminUrl);
    url.pathname = `/${name}`;
    return url.toString();
  }

  const deploy = (set: MigrationSet, url: string): CliResult =>
    runPrisma(['migrate', 'deploy', '--schema', set.schema], set, url);
  const resolveRolledBack = (
    set: MigrationSet,
    url: string,
    migration: string,
  ): CliResult =>
    runPrisma(
      [
        'migrate',
        'resolve',
        '--rolled-back',
        migration,
        '--schema',
        set.schema,
      ],
      set,
      url,
    );

  it('fresh database: every migration applies and the Stage 7 constraints exist and hold', async () => {
    const url = await createScratchDatabase('fresh');

    expectSuccess(deploy(sets.full, url));

    // The preflight passes clean (no warnings) on the fresh database. It runs
    // before the constraint probes below, which seed representative data
    // (including a legacy user with addresses but no default, a warning).
    const report = runPreflight(url);
    expect(report.status).toBe(0);
    expect(report.output).toContain('Stage 7 preflight passed.');

    await withDb(url, async (db) => {
      const history = await migrationHistory(db);
      expect(history.map((row) => row.name)).toEqual(sets.full.migrations);
      expect(history.every((row) => row.finished && !row.rolledBack)).toBe(
        true,
      );
      await expectStage7Schema(db);
      await expectStage7ConstraintsEnforced(db);
    });

    // schema.prisma and the migrations agree on every table Stage 7 touches.
    // (Older, unrelated drift elsewhere is out of scope for this check.)
    const diff = runCli(
      [
        PRISMA_CLI,
        'migrate',
        'diff',
        '--from-url',
        url,
        '--to-schema-datamodel',
        sets.full.schema,
      ],
      dirname(sets.full.schema),
      url,
    );
    expect(diff.status).toBe(0);
    expect(diff.output).not.toMatch(
      /`(addresses|carts|cart_items|orders|checkout_attempts)`/,
    );
  });

  it('representative existing data: upgrades without deleting or rewriting any row', async () => {
    const url = await createScratchDatabase('existing');
    expectSuccess(deploy(sets.pre, url));
    const seed = await withDb(url, seedRepresentativeData);

    // Before the upgrade: nothing blocks it; the checkout_attempts checks are
    // skipped (the table does not exist yet) and the legacy user with
    // addresses but no default is a warning only.
    const before = runPreflight(url);
    expect(before.status).toBe(0);
    expect(before.output).toMatch(/^SKIP {2}checkout_attempts/m);
    expect(
      preflightSection(before.output, 'users with addresses but no default'),
    ).toEqual([`user ${seed.users.dave}: 2 address(es)`]);

    const data = await withDb(url, captureData);
    expect(Object.keys(data.checkout_attempts ?? {})).toHaveLength(0);

    expectSuccess(deploy(sets.full, url));

    await withDb(url, async (db) => {
      expectRowsPreserved(data, await captureData(db));

      // Keyed legacy orders keep their keys verbatim (case included) and the
      // per-user unique index still protects them.
      const keyed = await db.$queryRawUnsafe<
        { id: string; user_id: string; idempotency_key: string }[]
      >(
        `SELECT id::text AS id, user_id::text AS user_id, idempotency_key
           FROM orders WHERE idempotency_key IS NOT NULL ORDER BY id`,
      );
      expect(keyed).toEqual(
        [
          {
            id: seed.orders.alicePaid,
            user_id: seed.users.alice,
            idempotency_key: 'legacy-checkout-key-1',
          },
          {
            id: seed.orders.alicePending,
            user_id: seed.users.alice,
            idempotency_key: UPPERCASE_KEY,
          },
          {
            id: seed.orders.bobPending,
            user_id: seed.users.bob,
            idempotency_key: UPPERCASE_KEY.toLowerCase(),
          },
        ].sort((a, b) => a.id.localeCompare(b.id)),
      );
      const revisions = await db.$queryRawUnsafe<{ revision: number }[]>(
        'SELECT DISTINCT revision FROM cart_items',
      );
      expect(revisions).toEqual([{ revision: 0 }]);
      expect(await count(db, 'checkout_attempts')).toBe(0);

      const history = await migrationHistory(db);
      expect(history.map((row) => row.name)).toEqual(sets.full.migrations);
      expect(history.every((row) => row.finished && !row.rolledBack)).toBe(
        true,
      );
      await expectStage7Schema(db);

      // The migrated data now sits behind the new constraints.
      await expect(
        insertNamingUniqueViolation(
          db,
          'addresses',
          address(seed.users.alice, true),
        ),
      ).rejects.toThrow(/unique violation on addresses_one_default_per_user/);
    });

    const after = runPreflight(url);
    expect(after.status).toBe(0);
    expect(after.output).toContain('passed with 1 warning(s)');
  });

  it('(a) duplicate default addresses: 20261008000000 fails, preflight reports them, forward repair succeeds', async () => {
    const url = await createScratchDatabase('dupdefault');
    expectSuccess(deploy(sets.pre, url));
    const seed = await withDb(url, seedRepresentativeData);
    const extraDefault = address(seed.users.alice, true, '2026-09-02 10:00:00');
    await withDb(url, (db) => insert(db, 'addresses', extraDefault));
    const offending = [seed.addresses.aliceDefault, extraDefault.id].sort();

    // 1. Preflight names the user and every default address, exit 1.
    const report = runPreflight(url);
    expect(report.status).toBe(1);
    const reported = preflightSection(
      report.output,
      'users with more than one default address',
    );
    expect(reported).toEqual([
      `user ${seed.users.alice}: ${offending.join(', ')}`,
    ]);

    // 2. The committed migration refuses the data and leaves it untouched.
    const failed = await expectDeployRefused(url, SHOPPING);
    expect(failed.output).toContain('addresses_one_default_per_user');
    expect(failed.output).toContain(seed.users.alice);

    // 3. A plain redeploy is refused until the failure is resolved (P3009),
    //    and still changes nothing.
    const data = await withDb(url, captureData);
    const blocked = deploy(sets.full, url);
    expect(blocked.status).not.toBe(0);
    expect(blocked.output).toContain('P3009');
    expect(await withDb(url, captureData)).toEqual(data);

    // 4. Forward repair: keep each user's most recently updated default (the
    //    rule AddressesService uses when it promotes), clear the others.
    const ids = idsIn(reported.join(' ')).filter(
      (id) => id !== seed.users.alice,
    );
    expect(ids).toEqual(offending);
    await withDb(url, (db) =>
      db.$executeRawUnsafe(
        `UPDATE addresses SET is_default = false, updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY(${uuidArray(ids)})
            AND id NOT IN (SELECT DISTINCT ON (user_id) id FROM addresses
                            WHERE id = ANY(${uuidArray(ids)})
                            ORDER BY user_id, updated_at DESC, id ASC)`,
      ),
    );
    expect(runPreflight(url).status).toBe(0);
    expectSuccess(resolveRolledBack(sets.full, url, SHOPPING));
    expectSuccess(deploy(sets.full, url));

    await withDb(url, async (db) => {
      const after = await captureData(db);
      const { addresses: beforeAddresses, ...rest } = data;
      const { addresses: afterAddresses, ...afterRest } = after;
      expectRowsPreserved(rest, afterRest);
      if (!beforeAddresses || !afterAddresses) {
        throw new Error('addresses were not captured');
      }
      // Every address still exists; only the losing default changed.
      expect(Object.keys(afterAddresses).sort()).toEqual(
        Object.keys(beforeAddresses).sort(),
      );
      expect(afterAddresses[extraDefault.id]).toMatchObject({
        is_default: true,
      });
      expect(afterAddresses[seed.addresses.aliceDefault]).toMatchObject({
        is_default: false,
      });
      expect(await historyOf(db, SHOPPING)).toEqual([
        { name: SHOPPING, finished: false, rolledBack: true },
        { name: SHOPPING, finished: true, rolledBack: false },
      ]);
      await expectStage7Schema(db);
    });
  });

  it('(b) non-positive cart quantity: 20261008000000 fails atomically, preflight reports it, forward repair succeeds', async () => {
    const url = await createScratchDatabase('cartqty');
    expectSuccess(deploy(sets.pre, url));
    const seed = await withDb(url, seedRepresentativeData);
    const zero = cartItem(seed.carts.bob, seed.offers.second, 0);
    const negative = cartItem(seed.carts.guest, seed.offers.first, -2);
    await withDb(url, async (db) => {
      await insert(db, 'cart_items', zero);
      await insert(db, 'cart_items', negative);
    });

    const report = runPreflight(url);
    expect(report.status).toBe(1);
    const reported = preflightSection(
      report.output,
      'cart_items with non-positive quantity',
    );
    expect(reported).toEqual(
      [
        `${zero.id} (cart ${seed.carts.bob}, quantity 0)`,
        `${negative.id} (cart ${seed.carts.guest}, quantity -2)`,
      ].sort(),
    );

    // The unique index and the revision column that precede the CHECK in the
    // same migration are rolled back with it (expectDeployRefused compares
    // the whole schema), so the failure leaves no partial Stage 7 DDL.
    const failed = await expectDeployRefused(url, SHOPPING);
    expect(failed.output).toContain('cart_items_quantity_positive');

    // Forward repair: a line with no positive quantity holds no purchase
    // intent, so the reported lines are deleted deliberately (by id).
    const ids = reported.flatMap((line) => line.split(' ').slice(0, 1));
    expect(ids).toEqual([zero.id, negative.id].sort());
    await withDb(url, (db) =>
      db.$executeRawUnsafe(
        `DELETE FROM cart_items WHERE id = ANY(${uuidArray(ids)}) AND quantity <= 0`,
      ),
    );
    expect(runPreflight(url).status).toBe(0);
    expectSuccess(resolveRolledBack(sets.full, url, SHOPPING));
    expectSuccess(deploy(sets.full, url));

    await withDb(url, async (db) => {
      const after = await captureData(db);
      const before = structuredClone(failed.data);
      const beforeItems = rowsOf(before, 'cart_items');
      for (const id of ids) delete beforeItems[id];
      expectRowsPreserved(before, after);
      await expectStage7Schema(db);
    });
  });

  it('(c) orphaned and invalid draft checkout_attempts: 20261015090000 raises with the IDs, forward repair succeeds', async () => {
    const url = await createScratchDatabase('attempts');
    expectSuccess(deploy(sets.shopping, url));
    const seed = await withDb(url, seedRepresentativeData);

    // Draft-era receipts (09209b9 wrote them without fingerprint metadata).
    const valid = {
      completed: attempt(seed.users.alice, {
        status: 'COMPLETED',
        order_id: seed.orders.alicePending,
        response: { order: { id: seed.orders.alicePending } },
      }),
      rejected: attempt(seed.users.bob, {
        status: 'REJECTED',
        response: { statusCode: 409, message: 'Out of stock' },
        error_status: 409,
      }),
      inProgress: attempt(seed.users.alice, { status: 'IN_PROGRESS' }),
    };
    const invalid = {
      negativeRevision: {
        ...cartItem(seed.carts.alice, seed.offers.firstNoCart, 1),
        revision: -1,
      },
      missingUser: attempt(randomUUID(), { status: 'IN_PROGRESS' }),
      missingOrder: attempt(seed.users.alice, {
        status: 'COMPLETED',
        order_id: randomUUID(),
        response: { order: { id: 'gone' } },
      }),
      foreignOrder: attempt(seed.users.bob, {
        status: 'COMPLETED',
        order_id: seed.orders.alicePaid,
        response: { order: { id: seed.orders.alicePaid } },
      }),
      rejectedNoStatus: attempt(seed.users.alice, {
        status: 'REJECTED',
        response: { statusCode: 409, message: 'Cart changed' },
      }),
      rejectedNoStatus2: attempt(seed.users.bob, {
        status: 'REJECTED',
        response: { statusCode: 422, message: 'Invalid address' },
      }),
    };
    await withDb(url, async (db) => {
      await insert(db, 'cart_items', invalid.negativeRevision);
      for (const row of [
        ...Object.values(valid),
        invalid.missingUser,
        invalid.missingOrder,
        invalid.foreignOrder,
        invalid.rejectedNoStatus,
        invalid.rejectedNoStatus2,
      ]) {
        await insert(db, 'checkout_attempts', row);
      }
    });
    const initial = await withDb(url, captureData);

    // The script reports every category at once (the DO block stops at the
    // first failing check), exit 1.
    const report = runPreflight(url);
    expect(report.status).toBe(1);
    expect(preflightSection(report.output, 'negative revision')).toEqual([
      `${invalid.negativeRevision.id} (cart ${seed.carts.alice}, quantity 1, revision -1)`,
    ]);
    expect(
      preflightSection(
        report.output,
        'checkout_attempts referencing missing users',
      ),
    ).toEqual([
      `${invalid.missingUser.id} (user ${invalid.missingUser.user_id})`,
    ]);
    expect(
      preflightSection(
        report.output,
        'checkout_attempts referencing missing or foreign orders',
      ),
    ).toEqual(
      [
        `${invalid.missingOrder.id} (order ${invalid.missingOrder.order_id} missing)`,
        `${invalid.foreignOrder.id} (order ${seed.orders.alicePaid} belongs to another user)`,
      ].sort(),
    );
    expect(
      idsIn(
        preflightSection(
          report.output,
          'checkout_attempts with an invalid recorded outcome',
        ).join(' '),
      ),
    ).toEqual(
      [invalid.rejectedNoStatus.id, invalid.rejectedNoStatus2.id].sort(),
    );

    // Round 1: negative revision.
    let raised = await expectReceiptsRefused(
      url,
      'cart_items with non-positive quantity or negative revision',
    );
    expect(raised).toEqual([invalid.negativeRevision.id]);
    // revision is only a concurrency counter; no order snapshot can hold a
    // negative one, so resetting it to 0 is safe.
    await withDb(url, (db) =>
      db.$executeRawUnsafe(
        `UPDATE cart_items SET revision = 0
          WHERE id = ANY(${uuidArray(raised)}) AND revision < 0`,
      ),
    );

    // Round 2: receipts of users that no longer exist (the new FK would have
    // cascaded them away with the user). Quarantine, then delete.
    raised = await expectReceiptsRefused(
      url,
      'checkout_attempts referencing missing users',
    );
    expect(raised).toEqual([invalid.missingUser.id]);
    await withDb(url, (db) => quarantineAttempts(db, raised));

    // Round 3: receipts whose order is missing or another user's. They guard
    // nothing the user owns; quarantine, then delete.
    raised = await expectReceiptsRefused(
      url,
      'checkout_attempts referencing missing or foreign orders',
    );
    expect(raised).toEqual(
      [invalid.missingOrder.id, invalid.foreignOrder.id].sort(),
    );
    await withDb(url, (db) => quarantineAttempts(db, raised));

    // Round 4: REJECTED receipts without error_status. The stored response
    // carries the status the client was given; restore it from there.
    raised = await expectReceiptsRefused(
      url,
      'checkout_attempts with an invalid recorded outcome',
    );
    expect(raised).toEqual(
      [invalid.rejectedNoStatus.id, invalid.rejectedNoStatus2.id].sort(),
    );
    await withDb(url, (db) =>
      db.$executeRawUnsafe(
        `UPDATE checkout_attempts
            SET error_status = (response->>'statusCode')::int
          WHERE id = ANY(${uuidArray(raised)})
            AND status = 'REJECTED' AND error_status IS NULL
            AND (response->>'statusCode')::int BETWEEN 400 AND 599`,
      ),
    );

    expect(runPreflight(url).status).toBe(0);
    expectSuccess(deploy(sets.full, url));

    await withDb(url, async (db) => {
      const after = await captureData(db);
      const quarantined = [
        invalid.missingUser.id,
        invalid.missingOrder.id,
        invalid.foreignOrder.id,
      ];
      const expected = structuredClone(initial);
      rowOf(expected, 'cart_items', invalid.negativeRevision.id).revision = 0;
      const expectedAttempts = rowsOf(expected, 'checkout_attempts');
      for (const id of quarantined) delete expectedAttempts[id];
      rowOf(
        expected,
        'checkout_attempts',
        invalid.rejectedNoStatus.id,
      ).error_status = 409;
      rowOf(
        expected,
        'checkout_attempts',
        invalid.rejectedNoStatus2.id,
      ).error_status = 422;
      // Valid draft receipts survive as legacy receipts: no fingerprint
      // metadata, stage RECEIVED, no owner or lease.
      expectRowsPreserved(expected, after);

      const kept = await db.$queryRawUnsafe<{ id: string }[]>(
        'SELECT id::text AS id FROM stage7_repair.checkout_attempts ORDER BY id',
      );
      expect(kept.map((row) => row.id)).toEqual([...quarantined].sort());

      expect(await historyOf(db, RECEIPTS)).toEqual([
        ...Array.from({ length: 4 }, () => ({
          name: RECEIPTS,
          finished: false,
          rolledBack: true,
        })),
        { name: RECEIPTS, finished: true, rolledBack: false },
      ]);
      await expectStage7Schema(db);
    });
  });

  /**
   * Deploys the full set expecting `migration` to fail, and proves the
   * failure deleted and rewrote nothing: every row and the whole schema are
   * identical before and after, and the history records the failure.
   */
  async function expectDeployRefused(
    url: string,
    migration: string,
  ): Promise<CliResult & { data: DataState }> {
    const before = await withDb(url, async (db) => ({
      data: await captureData(db),
      schema: await captureSchema(db),
    }));
    const result = deploy(sets.full, url);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(migration);
    await withDb(url, async (db) => {
      expect(await captureData(db)).toEqual(before.data);
      expect(await captureSchema(db)).toEqual(before.schema);
      const history = await migrationHistory(db);
      expect(history.at(-1)).toEqual({
        name: migration,
        finished: false,
        rolledBack: false,
      });
      expect(
        history.filter((row) => row.finished).map((row) => row.name),
      ).toEqual(
        sets.full.migrations.slice(0, sets.full.migrations.indexOf(migration)),
      );
    });
    return { ...result, data: before.data };
  }

  /**
   * One forward-repair round for 20261015090000: deploy fails with the DO
   * block's RAISE for `title`, nothing changed, the failure is marked rolled
   * back. Returns the IDs the RAISE text named.
   */
  async function expectReceiptsRefused(
    url: string,
    title: string,
  ): Promise<string[]> {
    const failed = await expectDeployRefused(url, RECEIPTS);
    const match = new RegExp(
      `Stage 7 preflight: ${escapeRegExp(title)}: ([^\\r\\n]*)`,
    ).exec(failed.output);
    if (!match) throw new Error(`No RAISE for "${title}":\n${failed.output}`);
    expectSuccess(resolveRolledBack(sets.full, url, RECEIPTS));
    return idsIn(match[1] ?? '');
  }
});

const UPPERCASE_KEY = '8F14E45F-CEEA-4D6B-9C1A-2E5B7A9D3F10';

function buildMigrationSet(
  root: string,
  name: string,
  include: (migration: string) => boolean,
): MigrationSet {
  const dir = join(root, name);
  mkdirSync(join(dir, 'migrations'), { recursive: true });
  copyFileSync(
    join(API_ROOT, 'prisma', 'schema.prisma'),
    join(dir, 'schema.prisma'),
  );
  copyFileSync(
    join(MIGRATIONS_DIR, 'migration_lock.toml'),
    join(dir, 'migrations', 'migration_lock.toml'),
  );
  const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(include)
    .sort();
  for (const migration of migrations) {
    cpSync(
      join(MIGRATIONS_DIR, migration),
      join(dir, 'migrations', migration),
      {
        recursive: true,
      },
    );
  }
  return { schema: join(dir, 'schema.prisma'), migrations };
}

function runCli(args: string[], cwd: string, databaseUrl: string): CliResult {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    timeout: 240_000,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      SHADOW_DATABASE_URL: UNUSED_SHADOW,
      CHECKPOINT_DISABLE: '1',
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
      NO_COLOR: '1',
    },
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  };
}

function runPrisma(
  args: string[],
  set: MigrationSet,
  databaseUrl: string,
): CliResult {
  return runCli([PRISMA_CLI, ...args], dirname(set.schema), databaseUrl);
}

function runPreflight(databaseUrl: string): CliResult {
  return runCli([PREFLIGHT], API_ROOT, databaseUrl);
}

function expectSuccess(result: CliResult): void {
  if (result.status !== 0) {
    throw new Error(`exit ${result.status}:\n${result.output}`);
  }
}

/** The indented lines the preflight script prints under a FAIL/WARN check. */
function preflightSection(output: string, title: string): string[] {
  const lines = output.split(/\r?\n/);
  const start = lines.findIndex(
    (line) => /^(FAIL|WARN) {2}/.test(line) && line.includes(title),
  );
  if (start < 0) return [];
  const section: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('        ')) break;
    section.push(line.trim());
  }
  return section;
}

function idsIn(text: string): string[] {
  return [...text.matchAll(UUID_PATTERN)].map((match) => match[0]).sort();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function withDb<T>(
  url: string,
  fn: (db: PrismaClient) => Promise<T>,
): Promise<T> {
  // A fresh client per step: no cached plans survive a schema change.
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    return await fn(db);
  } finally {
    await db.$disconnect();
  }
}

/** SQL literal for test-controlled values (the seed builds every value). */
function literal(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return `'${text.replace(/'/g, "''")}'`;
}

function uuidArray(ids: string[]): string {
  for (const id of ids) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error(`Not a UUID: ${id}`);
  }
  return `ARRAY[${ids.map(literal).join(', ')}]::uuid[]`;
}

async function insert(
  db: PrismaClient,
  table: string,
  row: Record<string, unknown>,
): Promise<void> {
  const columns = Object.keys(row);
  await db.$executeRawUnsafe(
    `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')})
     VALUES (${columns.map((c) => literal(row[c])).join(', ')})`,
  );
}

/**
 * Like insert, but a unique violation is re-raised with PostgreSQL's own
 * CONSTRAINT_NAME: Prisma's raw-query error omits the index name for unique
 * violations (it keeps it for CHECK and foreign-key ones).
 */
async function insertNamingUniqueViolation(
  db: PrismaClient,
  table: string,
  row: Record<string, unknown>,
): Promise<void> {
  const columns = Object.keys(row);
  await db.$executeRawUnsafe(
    `DO $do$
     DECLARE violated TEXT;
     BEGIN
       INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')})
       VALUES (${columns.map((c) => literal(row[c])).join(', ')});
     EXCEPTION WHEN unique_violation THEN
       GET STACKED DIAGNOSTICS violated = CONSTRAINT_NAME;
       RAISE EXCEPTION 'unique violation on %', violated;
     END $do$`,
  );
}

async function count(db: PrismaClient, table: string): Promise<number> {
  const [row] = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM "${table}"`,
  );
  if (!row) throw new Error(`count(*) on ${table} returned no row`);
  return row.n;
}

function address(
  userId: string,
  isDefault: boolean,
  updatedAt = SEEDED_AT,
): Record<string, unknown> & { id: string } {
  return {
    id: randomUUID(),
    user_id: userId,
    recipient_name: 'Legacy Recipient',
    line1: '1 Cairo Road',
    city: 'Lusaka',
    postal_code: '10101',
    country: 'ZM',
    is_default: isDefault,
    updated_at: updatedAt,
  };
}

function cartItem(
  cartId: string,
  offerId: string,
  quantity: number,
): Record<string, unknown> & { id: string } {
  return {
    id: randomUUID(),
    cart_id: cartId,
    offer_id: offerId,
    quantity,
    updated_at: SEEDED_AT,
  };
}

/** A checkout_attempts row as the 09209b9 draft (20261008000000) shaped it. */
function attempt(
  userId: string,
  fields: {
    status: string;
    order_id?: string;
    response?: unknown;
    error_status?: number;
  },
): Record<string, unknown> & {
  id: string;
  user_id: string;
  order_id: string | null;
} {
  return {
    id: randomUUID(),
    user_id: userId,
    key: randomUUID(),
    operation: 'cart',
    fingerprint: randomBytes(32).toString('hex'),
    status: fields.status,
    order_id: fields.order_id ?? null,
    response: fields.response ?? null,
    error_status: fields.error_status ?? null,
    updated_at: SEEDED_AT,
  };
}

/**
 * Pre-Stage-7 data as production holds it: customers with one default
 * address, a legacy customer with addresses but no default, user, guest and
 * merged carts, keyed (including an uppercase key) and keyless orders with
 * payments in several states, and reservations in every status. Only columns
 * that exist before 20261008000000 are written.
 */
async function seedRepresentativeData(db: PrismaClient): Promise<{
  users: Record<'alice' | 'bob' | 'carol' | 'dave', string>;
  addresses: { aliceDefault: string };
  carts: Record<'alice' | 'bob' | 'guest' | 'merged', string>;
  offers: Record<'first' | 'second' | 'firstNoCart', string>;
  orders: Record<
    'alicePaid' | 'alicePending' | 'bobCancelled' | 'bobPending',
    string
  >;
}> {
  const tag = randomBytes(4).toString('hex');
  const user = async (name: string): Promise<string> => {
    const id = randomUUID();
    await insert(db, 'users', {
      id,
      email: `${name}-${tag}@stage7-migration.test`,
      password_hash: 'not-a-real-hash',
      updated_at: SEEDED_AT,
    });
    return id;
  };
  const users = {
    alice: await user('alice'),
    bob: await user('bob'),
    carol: await user('carol'),
    dave: await user('dave'),
  };

  const aliceDefault = address(users.alice, true);
  for (const row of [
    aliceDefault,
    address(users.alice, false),
    address(users.bob, true),
    // Legacy: addresses but no default (a preflight warning, not a failure).
    address(users.dave, false),
    address(users.dave, false, '2026-09-03 10:00:00'),
  ]) {
    await insert(db, 'addresses', row);
  }

  const productId = randomUUID();
  const variantId = randomUUID();
  const warehouseId = randomUUID();
  const recordId = randomUUID();
  await insert(db, 'products', {
    id: productId,
    name: 'Legacy Kettle',
    slug: `legacy-kettle-${tag}`,
    status: 'PUBLISHED',
    updated_at: SEEDED_AT,
  });
  await insert(db, 'product_variants', {
    id: variantId,
    product_id: productId,
    sku_code: `LEGACY-KETTLE-${tag}`,
    status: 'PUBLISHED',
    updated_at: SEEDED_AT,
  });
  await insert(db, 'warehouses', {
    id: warehouseId,
    name: 'Legacy Warehouse',
    code: `LEG-${tag}`,
    updated_at: SEEDED_AT,
  });
  await insert(db, 'inventory_records', {
    id: recordId,
    variant_id: variantId,
    warehouse_id: warehouseId,
    on_hand: 20,
    reserved: 3,
    updated_at: SEEDED_AT,
  });
  const offer = async (): Promise<string> => {
    const id = randomUUID();
    await insert(db, 'offers', {
      id,
      variant_id: variantId,
      status: 'PUBLISHED',
      updated_at: SEEDED_AT,
    });
    return id;
  };
  const offers = {
    first: await offer(),
    second: await offer(),
    firstNoCart: await offer(),
  };

  const cart = async (fields: Record<string, unknown>): Promise<string> => {
    const id = randomUUID();
    await insert(db, 'carts', { id, updated_at: SEEDED_AT, ...fields });
    return id;
  };
  const carts = {
    alice: await cart({ user_id: users.alice }),
    bob: await cart({ user_id: users.bob }),
    guest: await cart({ guest_token: `guest-${tag}` }),
    merged: await cart({ guest_token: `merged-${tag}`, status: 'MERGED' }),
  };
  for (const row of [
    cartItem(carts.alice, offers.first, 2),
    cartItem(carts.alice, offers.second, 1),
    cartItem(carts.bob, offers.first, 5),
    cartItem(carts.guest, offers.second, 1),
    cartItem(carts.merged, offers.first, 1),
  ]) {
    await insert(db, 'cart_items', row);
  }

  const order = async (
    userId: string,
    status: string,
    idempotencyKey: string | null,
  ): Promise<string> => {
    const id = randomUUID();
    await insert(db, 'orders', {
      id,
      user_id: userId,
      status,
      currency: 'ZMW',
      subtotal: 5_000,
      shipping_amount: 500,
      total: 5_500,
      shipping_address: { recipientName: 'Legacy Recipient', city: 'Lusaka' },
      idempotency_key: idempotencyKey,
      updated_at: SEEDED_AT,
    });
    return id;
  };
  const orders = {
    alicePaid: await order(users.alice, 'PAID', 'legacy-checkout-key-1'),
    alicePending: await order(users.alice, 'PENDING_PAYMENT', UPPERCASE_KEY),
    bobCancelled: await order(users.bob, 'CANCELLED', null),
    // Same key as alice's, other user and lowercase: keys are per user.
    bobPending: await order(
      users.bob,
      'PENDING_PAYMENT',
      UPPERCASE_KEY.toLowerCase(),
    ),
  };
  const payment = async (
    orderId: string,
    status: string,
    extra: Record<string, unknown> = {},
  ): Promise<void> => {
    const id = randomUUID();
    await insert(db, 'payments', {
      id,
      order_id: orderId,
      provider: 'fake',
      status,
      amount: 5_500,
      currency: 'ZMW',
      idempotency_key: `payment-${id}`,
      updated_at: SEEDED_AT,
      ...extra,
    });
  };
  await payment(orders.alicePaid, 'SUCCEEDED', {
    provider_reference: `ref-${tag}-1`,
  });
  await payment(orders.alicePending, 'PENDING', {
    provider_reference: `ref-${tag}-2`,
  });
  await payment(orders.bobCancelled, 'FAILED', {
    failure_reason: 'card_declined',
  });

  for (const [status, quantity] of [
    ['ACTIVE', 3],
    ['COMMITTED', 2],
    ['RELEASED', 1],
    ['EXPIRED', 1],
  ] as const) {
    await insert(db, 'reservations', {
      id: randomUUID(),
      inventory_record_id: recordId,
      quantity,
      status,
      holder_type: 'order_item',
      holder_id: randomUUID(),
      expires_at: '2026-09-01 10:15:00',
      updated_at: SEEDED_AT,
    });
  }

  return {
    users,
    addresses: { aliceDefault: aliceDefault.id },
    carts,
    offers,
    orders,
  };
}

async function captureData(db: PrismaClient): Promise<DataState> {
  const state: DataState = {};
  for (const table of DATA_TABLES) {
    const [probe] = await db.$queryRawUnsafe<{ present: boolean }[]>(
      `SELECT to_regclass('public.${table}') IS NOT NULL AS present`,
    );
    if (!probe)
      throw new Error(`to_regclass probe of ${table} returned no row`);
    if (!probe.present) continue;
    const rows = await db.$queryRawUnsafe<
      { id: string; row: Record<string, unknown> }[]
    >(
      `SELECT id::text AS id, to_jsonb(t) AS row FROM public."${table}" t ORDER BY id`,
    );
    state[table] = Object.fromEntries(rows.map((r) => [r.id, r.row]));
  }
  return state;
}

async function captureSchema(db: PrismaClient): Promise<SchemaState> {
  const list = async (sql: string): Promise<string[]> =>
    (await db.$queryRawUnsafe<{ v: string }[]>(sql)).map((row) => row.v);
  return {
    columns: await list(
      `SELECT table_name || '.' || column_name || ' ' || data_type || ' '
              || is_nullable || ' ' || coalesce(column_default, '') AS v
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
        ORDER BY 1`,
    ),
    constraints: await list(
      `SELECT conrelid::regclass::text || '.' || conname || ' '
              || pg_get_constraintdef(oid) AS v
         FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conrelid <> 'public._prisma_migrations'::regclass
        ORDER BY 1`,
    ),
    indexes: await list(
      `SELECT indexdef AS v FROM pg_indexes
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
        ORDER BY 1`,
    ),
  };
}

async function migrationHistory(db: PrismaClient): Promise<HistoryRow[]> {
  return db.$queryRawUnsafe<HistoryRow[]>(
    `SELECT migration_name AS name,
            finished_at IS NOT NULL AS "finished",
            rolled_back_at IS NOT NULL AS "rolledBack"
       FROM _prisma_migrations
      ORDER BY started_at, migration_name`,
  );
}

async function historyOf(
  db: PrismaClient,
  migration: string,
): Promise<HistoryRow[]> {
  return (await migrationHistory(db)).filter((row) => row.name === migration);
}

/**
 * Every row that existed before is still there with every pre-existing column
 * unchanged; columns Stage 7 added carry their documented default.
 */
function expectRowsPreserved(before: DataState, after: DataState): void {
  for (const [table, rows] of Object.entries(before)) {
    expect({ table, ids: Object.keys(after[table] ?? {}).sort() }).toEqual({
      table,
      ids: Object.keys(rows).sort(),
    });
    const added = STAGE7_ADDED_COLUMNS[table] ?? {};
    for (const [id, row] of Object.entries(rows)) {
      expect({ table, id, row: after[table]?.[id] }).toEqual({
        table,
        id,
        row: { ...added, ...row },
      });
    }
  }
}

/** The captured rows of `table`; throws if the table was not captured. */
function rowsOf(state: DataState, table: string): TableRows {
  const rows = state[table];
  if (!rows) throw new Error(`${table} was not captured`);
  return rows;
}

/** One captured row; throws if it was not captured. */
function rowOf(
  state: DataState,
  table: string,
  id: string,
): Record<string, unknown> {
  const row = rowsOf(state, table)[id];
  if (!row) throw new Error(`${table} row ${id} was not captured`);
  return row;
}

/** Moves draft receipts to stage7_repair.checkout_attempts, then deletes them. */
async function quarantineAttempts(
  db: PrismaClient,
  ids: string[],
): Promise<void> {
  await db.$transaction([
    db.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS stage7_repair'),
    db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS stage7_repair.checkout_attempts
         (LIKE public.checkout_attempts)`,
    ),
    db.$executeRawUnsafe(
      `INSERT INTO stage7_repair.checkout_attempts
       SELECT * FROM public.checkout_attempts WHERE id = ANY(${uuidArray(ids)})`,
    ),
    db.$executeRawUnsafe(
      `DELETE FROM public.checkout_attempts WHERE id = ANY(${uuidArray(ids)})`,
    ),
  ]);
}

async function expectStage7Schema(db: PrismaClient): Promise<void> {
  const constraints = await db.$queryRawUnsafe<{ name: string; def: string }[]>(
    `SELECT conname AS name, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND conrelid IN ('public.cart_items'::regclass,
                         'public.checkout_attempts'::regclass)
      ORDER BY conname`,
  );
  const def = Object.fromEntries(constraints.map((c) => [c.name, c.def]));
  expect(def).toMatchObject({
    cart_items_quantity_positive: 'CHECK ((quantity > 0))',
    cart_items_revision_nonnegative: 'CHECK ((revision >= 0))',
    checkout_attempts_status_check: expect.stringMatching(
      /IN_PROGRESS.*COMPLETED.*REJECTED.*BLOCKED/,
    ) as unknown,
    checkout_attempts_stage_check: expect.stringMatching(
      /RECEIVED.*ORDER_CREATED.*PAYMENT_STARTED.*FINISHED/,
    ) as unknown,
    checkout_attempts_operation_check: expect.stringMatching(
      /cart.*buy-now/,
    ) as unknown,
    checkout_attempts_fingerprint_metadata_check: expect.stringContaining(
      'fingerprint_key_id IS NULL',
    ) as unknown,
    checkout_attempts_lease_check: expect.stringContaining(
      'lease_expires_at IS NULL',
    ) as unknown,
    // cart-data-2: a REJECTED receipt must carry its HTTP status.
    checkout_attempts_outcome_check: expect.stringContaining(
      'error_status IS NOT NULL',
    ) as unknown,
    checkout_attempts_user_id_fkey:
      'FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE',
    checkout_attempts_order_id_fkey:
      'FOREIGN KEY (order_id) REFERENCES orders(id) ON UPDATE CASCADE',
  });

  const indexes = await db.$queryRawUnsafe<{ name: string; def: string }[]>(
    `SELECT indexname AS name, indexdef AS def FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('addresses_one_default_per_user',
                          'checkout_attempts_user_id_key_key',
                          'checkout_attempts_order_id_key',
                          'orders_user_id_idempotency_key_key')
      ORDER BY indexname`,
  );
  expect(Object.fromEntries(indexes.map((i) => [i.name, i.def]))).toEqual({
    addresses_one_default_per_user:
      'CREATE UNIQUE INDEX addresses_one_default_per_user ON public.addresses USING btree (user_id) WHERE is_default',
    checkout_attempts_order_id_key:
      'CREATE UNIQUE INDEX checkout_attempts_order_id_key ON public.checkout_attempts USING btree (order_id)',
    checkout_attempts_user_id_key_key:
      'CREATE UNIQUE INDEX checkout_attempts_user_id_key_key ON public.checkout_attempts USING btree (user_id, key)',
    orders_user_id_idempotency_key_key:
      'CREATE UNIQUE INDEX orders_user_id_idempotency_key_key ON public.orders USING btree (user_id, idempotency_key)',
  });

  const columns = await db.$queryRawUnsafe<
    { column: string; type: string; nullable: string; default: string | null }[]
  >(
    `SELECT table_name || '.' || column_name AS "column", data_type AS type,
            is_nullable AS nullable, column_default AS "default"
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN (('cart_items', 'revision'),
                                          ('orders', 'checkout_cart_snapshot'))
      ORDER BY 1`,
  );
  expect(columns).toEqual([
    {
      column: 'cart_items.revision',
      type: 'integer',
      nullable: 'NO',
      default: '0',
    },
    {
      column: 'orders.checkout_cart_snapshot',
      type: 'jsonb',
      nullable: 'YES',
      default: null,
    },
  ]);
}

/** Probes each Stage 7 constraint with a row that must be refused. */
async function expectStage7ConstraintsEnforced(
  db: PrismaClient,
): Promise<void> {
  const seed = await seedRepresentativeData(db);
  await expect(
    insertNamingUniqueViolation(db, 'addresses', address(seed.users.bob, true)),
  ).rejects.toThrow(/unique violation on addresses_one_default_per_user/);
  await expect(
    insert(db, 'cart_items', cartItem(seed.carts.bob, seed.offers.second, 0)),
  ).rejects.toThrow(/cart_items_quantity_positive/);
  await expect(
    insert(db, 'cart_items', {
      ...cartItem(seed.carts.bob, seed.offers.second, 1),
      revision: -1,
    }),
  ).rejects.toThrow(/cart_items_revision_nonnegative/);
  await expect(
    insert(
      db,
      'checkout_attempts',
      attempt(randomUUID(), { status: 'IN_PROGRESS' }),
    ),
  ).rejects.toThrow(/checkout_attempts_user_id_fkey/);
  await expect(
    insert(
      db,
      'checkout_attempts',
      attempt(seed.users.alice, {
        status: 'COMPLETED',
        order_id: randomUUID(),
        response: {},
      }),
    ),
  ).rejects.toThrow(/checkout_attempts_order_id_fkey/);
  await expect(
    insert(
      db,
      'checkout_attempts',
      attempt(seed.users.alice, { status: 'REJECTED', response: {} }),
    ),
  ).rejects.toThrow(/checkout_attempts_outcome_check/);
  await expect(
    insert(
      db,
      'checkout_attempts',
      attempt(seed.users.alice, { status: 'BLOCKED' }),
    ),
  ).rejects.toThrow(/checkout_attempts_outcome_check/);
  await expect(
    insert(db, 'checkout_attempts', {
      ...attempt(seed.users.alice, { status: 'IN_PROGRESS' }),
      owner_token: randomUUID(),
    }),
  ).rejects.toThrow(/checkout_attempts_lease_check/);
  await expect(
    insert(db, 'checkout_attempts', {
      ...attempt(seed.users.alice, { status: 'IN_PROGRESS' }),
      operation: 'bogus',
    }),
  ).rejects.toThrow(/checkout_attempts_operation_check/);
  // A valid receipt with full metadata is accepted.
  await insert(db, 'checkout_attempts', {
    ...attempt(seed.users.alice, {
      status: 'REJECTED',
      response: { statusCode: 409 },
      error_status: 409,
    }),
    fingerprint_key_id: 'v1',
    fingerprint_version: 1,
    stage: 'FINISHED',
    completed_at: SEEDED_AT,
  });
}
