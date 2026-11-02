import { randomUUID } from 'node:crypto';

import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Address, PrismaClient } from '@prisma/client';

import { DatabaseModule } from '../src/database/database.module';
import { PrismaService } from '../src/database/prisma.service';
import { AddressesModule } from '../src/modules/users/addresses/addresses.module';
import { AddressesService } from '../src/modules/users/addresses/addresses.service';
import type { CreateAddressDto } from '../src/modules/users/addresses/dto/create-address.dto';

jest.setTimeout(30_000);

type Deferred = { promise: Promise<void>; resolve: () => void };

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/**
 * Address default invariant against a real, migrated Postgres database:
 * every mutation serializes on the users row (FOR UPDATE), so a user with
 * addresses has exactly one default, and the partial unique index
 * addresses_one_default_per_user backs it up at the database level.
 *
 * Interleavings are forced with barriers, never sleeps: a separate client
 * holds the users row lock in an open transaction, each competing request is
 * started and then awaited until Postgres reports its backend as waiting on
 * a lock, and only then is the lock released. Requests queued on one row
 * lock are granted in arrival order, so starting them one at a time (each
 * observed blocked before the next starts) fixes the order they run in.
 */
describe('Addresses — default invariant (integration, real Postgres)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let addresses: AddressesService;
  // Separate pools: the lock holder and the observer must never wait for a
  // connection the requests under test are holding.
  let lockClient: PrismaClient;
  let observer: PrismaClient;
  const userIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, AddressesModule],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    addresses = moduleRef.get(AddressesService);
    lockClient = new PrismaClient();
    observer = new PrismaClient();
    await Promise.all([lockClient.$connect(), observer.$connect()]);
  });

  afterAll(async () => {
    // Addresses cascade with their user.
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await Promise.all([lockClient.$disconnect(), observer.$disconnect()]);
    await moduleRef.close();
  });

  async function createUser(): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `addresses-int-${randomUUID()}@example.com`,
        passwordHash: 'not-a-real-hash',
      },
    });
    userIds.push(user.id);
    return user.id;
  }

  function addressDto(label: string): CreateAddressDto {
    return {
      label,
      recipientName: `Recipient ${label}`,
      line1: `${label} Main Road`,
      city: 'Lusaka',
      postalCode: '10101',
      country: 'ZM',
    };
  }

  /** Inserts an address directly, bypassing the service (legacy/fixture). */
  async function insertAddress(
    userId: string,
    label: string,
    options: { id?: string; isDefault?: boolean; updatedAt?: Date } = {},
  ): Promise<Address> {
    const created = await prisma.address.create({
      data: {
        ...addressDto(label),
        id: options.id ?? randomUUID(),
        userId,
        isDefault: options.isDefault ?? false,
      },
    });
    if (!options.updatedAt) {
      return created;
    }
    // @updatedAt is always set by Prisma; pin it with raw SQL instead. The
    // column is timestamp without time zone holding UTC (Prisma's
    // convention), so convert explicitly rather than through the session
    // TimeZone.
    await prisma.$executeRaw`
      UPDATE addresses
      SET updated_at = (${options.updatedAt.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      WHERE id = ${created.id}::uuid`;
    const pinned = await prisma.address.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(pinned.updatedAt.getTime()).toBe(options.updatedAt.getTime());
    return pinned;
  }

  async function listAddresses(userId: string): Promise<Address[]> {
    return prisma.address.findMany({
      where: { userId },
      orderBy: { id: 'asc' },
    });
  }

  async function defaultsOf(userId: string): Promise<string[]> {
    const rows = await prisma.address.findMany({
      where: { userId, isDefault: true },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async function lockWaiters(): Promise<number> {
    const [row] = await observer.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND query ILIKE '%FROM users WHERE id%FOR UPDATE%'
        AND cardinality(pg_blocking_pids(pid)) > 0`;
    return row?.waiting ?? 0;
  }

  /** Condition polling (no fixed sleeps) until `count` backends are blocked. */
  async function waitForLockWaiters(count: number): Promise<void> {
    const deadline = Date.now() + 3_000;
    for (;;) {
      const waiting = await lockWaiters();
      if (waiting >= count) {
        expect(waiting).toBe(count);
        return;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Expected ${count} backend(s) blocked on the users row lock, saw ${waiting}`,
        );
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  /** Holds the users row lock in an open transaction until released. */
  async function holdUserLock(
    userId: string,
  ): Promise<{ release: () => Promise<void> }> {
    const acquired = deferred();
    const released = deferred();
    const holder = lockClient.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      acquired.resolve();
      await released.promise;
    });
    await Promise.race([acquired.promise, holder]);
    return {
      release: async (): Promise<void> => {
        released.resolve();
        await holder;
      },
    };
  }

  /**
   * Starts each operation while the users row is locked, waiting until it is
   * blocked before starting the next, then releases the lock. The operations
   * therefore run one after another in the given order.
   */
  async function runQueued(
    userId: string,
    operations: Array<() => Promise<unknown>>,
    beforeRelease?: () => Promise<void>,
  ): Promise<PromiseSettledResult<unknown>[]> {
    const lock = await holdUserLock(userId);
    const pending: Promise<unknown>[] = [];
    try {
      for (const [index, operation] of operations.entries()) {
        const started = operation();
        // Observed through allSettled below; avoid an unhandled rejection
        // while the next operation is being queued.
        started.catch(() => undefined);
        pending.push(started);
        await waitForLockWaiters(index + 1);
      }
      await beforeRelease?.();
    } finally {
      await lock.release();
    }
    return Promise.allSettled(pending);
  }

  function fulfilled<T>(result: PromiseSettledResult<unknown>): T {
    if (result.status !== 'fulfilled') {
      throw result.reason;
    }
    return result.value as T;
  }

  /**
   * Fixture for promotion order: D is the default; W has the lowest id but
   * the oldest updatedAt; X and Y share one updatedAt, X with the lower id.
   * X is inserted last, so neither insertion order nor physical order favours
   * it — only the (updatedAt desc, id asc) rule does.
   */
  async function promotionFixture(): Promise<{
    userId: string;
    d: Address;
    w: Address;
    x: Address;
    y: Address;
  }> {
    const userId = await createUser();
    const [wId, xId, yId] = [randomUUID(), randomUUID(), randomUUID()].sort();
    const now = Date.now();
    const tie = new Date(now - 60 * 60_000);
    const older = new Date(now - 2 * 60 * 60_000);
    const d = await insertAddress(userId, 'D', {
      isDefault: true,
      updatedAt: older,
    });
    const y = await insertAddress(userId, 'Y', { id: yId, updatedAt: tie });
    const w = await insertAddress(userId, 'W', { id: wId, updatedAt: older });
    const x = await insertAddress(userId, 'X', { id: xId, updatedAt: tie });
    expect(x.updatedAt.getTime()).toBe(y.updatedAt.getTime());
    expect(x.id < y.id && w.id < x.id).toBe(true);
    expect(await defaultsOf(userId)).toEqual([d.id]);
    return { userId, d, w, x, y };
  }

  describe('concurrent first address creation', () => {
    it('makes exactly one of N simultaneous first addresses the default', async () => {
      const userId = await createUser();
      const n = 5;

      const results = await runQueued(
        userId,
        Array.from(
          { length: n },
          (_, index) => (): Promise<unknown> =>
            addresses.create(userId, addressDto(`A${index}`)),
        ),
        async () => {
          // The barrier holds: nothing was written while the lock was held.
          // Read through the observer: the n queued creates may hold every
          // connection in the service's pool until the lock is released.
          expect(await observer.address.count({ where: { userId } })).toBe(0);
        },
      );

      const created = results.map((result) => fulfilled<Address>(result));
      expect(created).toHaveLength(n);
      // Queued first, ran first: it saw no addresses and became the default.
      expect(created.map((address) => address.isDefault)).toEqual([
        true,
        false,
        false,
        false,
        false,
      ]);
      expect(await prisma.address.count({ where: { userId } })).toBe(n);
      expect(await defaultsOf(userId)).toEqual([created[0]!.id]);
    });

    it('keeps one default when N creates race without a barrier', async () => {
      const userId = await createUser();
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, (_, index) =>
          addresses.create(userId, addressDto(`B${index}`)),
        ),
      );
      expect(results.map((result) => result.status)).toEqual(
        Array(5).fill('fulfilled'),
      );
      expect(await prisma.address.count({ where: { userId } })).toBe(5);
      expect(await defaultsOf(userId)).toHaveLength(1);
    });
  });

  describe('competing setDefault promotions', () => {
    it('leaves exactly one default, the last promotion to run', async () => {
      const userId = await createUser();
      const a = await addresses.create(userId, addressDto('A'));
      const b = await addresses.create(userId, addressDto('B'));
      const c = await addresses.create(userId, addressDto('C'));
      expect(await defaultsOf(userId)).toEqual([a.id]);

      const results = await runQueued(userId, [
        (): Promise<unknown> => addresses.setDefault(userId, b.id),
        (): Promise<unknown> => addresses.setDefault(userId, c.id),
        (): Promise<unknown> => addresses.setDefault(userId, b.id),
        (): Promise<unknown> => addresses.setDefault(userId, c.id),
      ]);

      for (const result of results) {
        expect(fulfilled<Address>(result).isDefault).toBe(true);
      }
      expect(await defaultsOf(userId)).toEqual([c.id]);
      expect(await prisma.address.count({ where: { userId } })).toBe(3);
    });

    it('keeps one default when promotions race without a barrier', async () => {
      const userId = await createUser();
      const created: Address[] = [];
      for (const label of ['A', 'B', 'C', 'D']) {
        created.push(await addresses.create(userId, addressDto(label)));
      }
      const results = await Promise.allSettled(
        [...created, ...created].map((address) =>
          addresses.setDefault(userId, address.id),
        ),
      );
      expect(results.every((result) => result.status === 'fulfilled')).toBe(
        true,
      );
      expect(await defaultsOf(userId)).toHaveLength(1);
    });
  });

  describe('deleting the default concurrently with creating or promoting another', () => {
    it('remove(default) then create: promotes the most recently updated, id breaking the tie', async () => {
      const { userId, d, x } = await promotionFixture();

      const [removed, createdResult] = await runQueued(userId, [
        (): Promise<unknown> => addresses.remove(userId, d.id),
        (): Promise<unknown> => addresses.create(userId, addressDto('Z')),
      ]);

      fulfilled(removed!);
      const z = fulfilled<Address>(createdResult!);
      // X won the (updatedAt, id) tie over Y and beat the older, lower-id W.
      expect(await defaultsOf(userId)).toEqual([x.id]);
      expect(z.isDefault).toBe(false);
      expect((await listAddresses(userId)).map((row) => row.id)).not.toContain(
        d.id,
      );
      expect(await prisma.address.count({ where: { userId } })).toBe(4);
    });

    it('create then remove(default): the new address is the most recently updated and is promoted', async () => {
      const { userId, d } = await promotionFixture();

      const [createdResult, removed] = await runQueued(userId, [
        (): Promise<unknown> => addresses.create(userId, addressDto('Z')),
        (): Promise<unknown> => addresses.remove(userId, d.id),
      ]);

      const z = fulfilled<Address>(createdResult!);
      fulfilled(removed!);
      expect(z.isDefault).toBe(false);
      expect(await defaultsOf(userId)).toEqual([z.id]);
      expect(await prisma.address.count({ where: { userId } })).toBe(4);
    });

    it('remove(default) then setDefault(other): the explicit promotion wins', async () => {
      const { userId, d, x, y } = await promotionFixture();

      const [removed, promoted] = await runQueued(userId, [
        (): Promise<unknown> => addresses.remove(userId, d.id),
        (): Promise<unknown> => addresses.setDefault(userId, y.id),
      ]);

      fulfilled(removed!);
      expect(fulfilled<Address>(promoted!).id).toBe(y.id);
      expect(await defaultsOf(userId)).toEqual([y.id]);
      expect(
        (await prisma.address.findUniqueOrThrow({ where: { id: x.id } }))
          .isDefault,
      ).toBe(false);
    });

    it('setDefault(other) then remove(old default): no second promotion', async () => {
      const { userId, d, y } = await promotionFixture();

      const [promoted, removed] = await runQueued(userId, [
        (): Promise<unknown> => addresses.setDefault(userId, y.id),
        (): Promise<unknown> => addresses.remove(userId, d.id),
      ]);

      expect(fulfilled<Address>(promoted!).id).toBe(y.id);
      fulfilled(removed!);
      expect(await defaultsOf(userId)).toEqual([y.id]);
      expect(await prisma.address.count({ where: { userId } })).toBe(3);
    });

    it.each([
      ['the default first', 'default-first'],
      ['the promotion candidate first', 'candidate-first'],
    ])(
      'removing the default and its promotion candidate together (%s) leaves one default',
      async (_label, order) => {
        // The review's legacy failure: deleting default D while X (the
        // address D's deletion would promote) is deleted concurrently.
        const { userId, d, w, x, y } = await promotionFixture();
        const removeD = (): Promise<unknown> => addresses.remove(userId, d.id);
        const removeX = (): Promise<unknown> => addresses.remove(userId, x.id);

        const results = await runQueued(
          userId,
          order === 'default-first' ? [removeD, removeX] : [removeX, removeD],
        );

        results.forEach((result) => fulfilled(result));
        expect((await listAddresses(userId)).map((row) => row.id)).toEqual(
          [w.id, y.id].sort(),
        );
        // Y (tie timestamp) is more recently updated than W.
        expect(await defaultsOf(userId)).toEqual([y.id]);
      },
    );

    it('removing every address leaves none and no error', async () => {
      const userId = await createUser();
      const a = await addresses.create(userId, addressDto('A'));
      const b = await addresses.create(userId, addressDto('B'));

      const results = await runQueued(userId, [
        (): Promise<unknown> => addresses.remove(userId, a.id),
        (): Promise<unknown> => addresses.remove(userId, b.id),
      ]);

      results.forEach((result) => fulfilled(result));
      expect(await prisma.address.count({ where: { userId } })).toBe(0);
    });
  });

  describe('ownership', () => {
    it("rejects another user's address with 404 inside the locked transaction and changes nothing", async () => {
      const ownerId = await createUser();
      const otherId = await createUser();
      const ownerDefault = await addresses.create(ownerId, addressDto('O1'));
      const ownerSecond = await addresses.create(ownerId, addressDto('O2'));
      const otherDefault = await addresses.create(otherId, addressDto('X1'));
      const before = [
        ...(await listAddresses(ownerId)),
        ...(await listAddresses(otherId)),
      ];

      const settled = await runQueued(
        otherId,
        [
          (): Promise<unknown> => addresses.setDefault(otherId, ownerSecond.id),
          (): Promise<unknown> =>
            addresses.update(otherId, ownerSecond.id, {
              line1: 'Hijacked Road',
            }),
          (): Promise<unknown> => addresses.remove(otherId, ownerDefault.id),
          (): Promise<unknown> => addresses.setDefault(otherId, randomUUID()),
        ],
        async () => {
          // Still blocked on the caller's own users row: the ownership check
          // runs inside the transaction, after the lock, not before it.
          expect(await lockWaiters()).toBe(4);
        },
      );

      for (const result of settled) {
        expect(result.status).toBe('rejected');
        const reason = (result as PromiseRejectedResult).reason as unknown;
        expect(reason).toBeInstanceOf(NotFoundException);
        expect((reason as NotFoundException).getStatus()).toBe(404);
      }
      const after = [
        ...(await listAddresses(ownerId)),
        ...(await listAddresses(otherId)),
      ];
      // Byte-for-byte unchanged, including updatedAt and both users' defaults
      // (setDefault's "unset others" never ran for the caller either).
      expect(after).toEqual(before);
      expect(await defaultsOf(ownerId)).toEqual([ownerDefault.id]);
      expect(await defaultsOf(otherId)).toEqual([otherDefault.id]);
      await expect(
        addresses.findOne(otherId, ownerSecond.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('database constraint addresses_one_default_per_user', () => {
    const UNIQUE_VIOLATION = /Code: `23505`/;

    /**
     * Runs `statement` and reports the unique constraint it violated. Prisma's
     * raw-query error carries only the SQLSTATE and detail, so the statement
     * runs in a DO block that reads CONSTRAINT_NAME from the diagnostics and
     * re-raises it. Any exception aborts the block, so nothing persists.
     * Only test-generated UUIDs are interpolated.
     */
    async function violatedConstraint(statement: string): Promise<string> {
      try {
        await prisma.$executeRawUnsafe(`
          DO $$
          DECLARE violated text;
          BEGIN
            ${statement};
            RAISE EXCEPTION 'no-violation';
          EXCEPTION WHEN unique_violation THEN
            GET STACKED DIAGNOSTICS violated = CONSTRAINT_NAME;
            RAISE EXCEPTION 'violated:%', violated;
          END
          $$`);
      } catch (error) {
        const match = /violated:([a-z_]+)/.exec(String(error));
        if (match) {
          return match[1]!;
        }
        throw error;
      }
      throw new Error('statement unexpectedly succeeded');
    }

    function insertSql(id: string, userId: string, isDefault: boolean): string {
      return `INSERT INTO addresses (id, user_id, recipient_name, line1, city, postal_code, country, is_default, updated_at)
        VALUES ('${id}'::uuid, '${userId}'::uuid, 'Raw', 'Raw Road', 'Lusaka', '10101', 'ZM', ${isDefault}, now())`;
    }

    it('rejects a second default by raw INSERT or UPDATE, per user only', async () => {
      const userId = await createUser();
      const first = await addresses.create(userId, addressDto('A'));
      const second = await addresses.create(userId, addressDto('B'));

      await expect(
        prisma.$executeRawUnsafe(insertSql(randomUUID(), userId, true)),
      ).rejects.toThrow(UNIQUE_VIOLATION);
      expect(
        await violatedConstraint(insertSql(randomUUID(), userId, true)),
      ).toBe('addresses_one_default_per_user');

      await expect(
        prisma.$executeRaw`UPDATE addresses SET is_default = true WHERE id = ${second.id}::uuid`,
      ).rejects.toThrow(UNIQUE_VIOLATION);
      expect(
        await violatedConstraint(
          `UPDATE addresses SET is_default = true WHERE id = '${second.id}'::uuid`,
        ),
      ).toBe('addresses_one_default_per_user');

      // Checked per statement, not at commit: setting the new default before
      // unsetting the old one fails even inside one transaction.
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRaw`UPDATE addresses SET is_default = true WHERE id = ${second.id}::uuid`;
          await tx.$executeRaw`UPDATE addresses SET is_default = false WHERE id = ${first.id}::uuid`;
        }),
      ).rejects.toThrow(UNIQUE_VIOLATION);

      expect(await prisma.address.count({ where: { userId } })).toBe(2);
      expect(await defaultsOf(userId)).toEqual([first.id]);

      // The index is partial and per user: extra non-defaults and another
      // user's default are fine.
      await prisma.$executeRawUnsafe(insertSql(randomUUID(), userId, false));
      const otherId = await createUser();
      await prisma.$executeRawUnsafe(insertSql(randomUUID(), otherId, true));
      expect(await defaultsOf(otherId)).toHaveLength(1);
      expect(await defaultsOf(userId)).toEqual([first.id]);
      expect(await prisma.address.count({ where: { userId } })).toBe(3);
    });
  });

  describe('legacy user with addresses but no default', () => {
    async function legacyUser(): Promise<{
      userId: string;
      w: Address;
      x: Address;
      y: Address;
    }> {
      const userId = await createUser();
      const [wId, xId, yId] = [randomUUID(), randomUUID(), randomUUID()].sort();
      const now = Date.now();
      const tie = new Date(now - 60 * 60_000);
      const older = new Date(now - 2 * 60 * 60_000);
      const y = await insertAddress(userId, 'Y', { id: yId, updatedAt: tie });
      const w = await insertAddress(userId, 'W', { id: wId, updatedAt: older });
      const x = await insertAddress(userId, 'X', { id: xId, updatedAt: tie });
      expect(await defaultsOf(userId)).toEqual([]);
      return { userId, w, x, y };
    }

    it('remove() of a non-default promotes the most recently updated remaining (id tie-breaker)', async () => {
      const { userId, w, x } = await legacyUser();

      await addresses.remove(userId, w.id);

      expect(await defaultsOf(userId)).toEqual([x.id]);
    });

    it('create() promotes the most recently updated address, the new one, and returns it as default', async () => {
      const { userId } = await legacyUser();

      const created = await addresses.create(userId, addressDto('Z'));

      expect(created.isDefault).toBe(true);
      expect(await defaultsOf(userId)).toEqual([created.id]);
      expect(await prisma.address.count({ where: { userId } })).toBe(4);
    });

    it('setDefault() leaves exactly the chosen default', async () => {
      const { userId, y } = await legacyUser();

      await addresses.setDefault(userId, y.id);

      expect(await defaultsOf(userId)).toEqual([y.id]);
    });

    it('concurrent removes on a legacy user repair it exactly once', async () => {
      const { userId, w, x, y } = await legacyUser();

      const results = await runQueued(userId, [
        (): Promise<unknown> => addresses.remove(userId, w.id),
        (): Promise<unknown> => addresses.remove(userId, y.id),
      ]);

      results.forEach((result) => fulfilled(result));
      // The first remove promoted X (tie winner); the second removed a
      // non-default and found the default in place.
      expect(await defaultsOf(userId)).toEqual([x.id]);
      expect(await prisma.address.count({ where: { userId } })).toBe(1);
    });

    it('concurrent create and remove on a legacy user leave one default', async () => {
      const { userId, x, y } = await legacyUser();

      const [removed, createdResult] = await runQueued(userId, [
        (): Promise<unknown> => addresses.remove(userId, y.id),
        (): Promise<unknown> => addresses.create(userId, addressDto('Z')),
      ]);

      fulfilled(removed!);
      const z = fulfilled<Address>(createdResult!);
      // remove() ran first and promoted X, so create() found a default.
      expect(z.isDefault).toBe(false);
      expect(await defaultsOf(userId)).toEqual([x.id]);
    });
  });
});
