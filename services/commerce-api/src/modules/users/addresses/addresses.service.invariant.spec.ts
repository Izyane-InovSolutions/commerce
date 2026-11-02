import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';

/*
 * Drives AddressesService against an in-memory address table that enforces
 * the partial unique index addresses_one_default_per_user and rolls a failed
 * transaction back, so the "exactly one default whenever addresses remain"
 * invariant is checked on the resulting rows rather than on calls.
 */

type AddressRow = {
  id: string;
  userId: string;
  isDefault: boolean;
  city: string;
  updatedAt: Date;
};

type Where = Partial<Pick<AddressRow, 'id' | 'userId' | 'isDefault'>>;

class FakeAddressDb {
  rows: AddressRow[] = [];
  /** Operations in order, so tests can check the lock comes first. */
  log: string[] = [];
  private clock = Date.UTC(2026, 0, 1);
  private sequence = 0;

  now(): Date {
    this.clock += 1000;
    return new Date(this.clock);
  }

  seed(row: Partial<AddressRow> & Pick<AddressRow, 'id' | 'userId'>): void {
    this.rows.push({
      isDefault: false,
      city: 'C',
      updatedAt: this.now(),
      ...row,
    });
  }

  defaultsOf(userId: string): string[] {
    return this.rows
      .filter((row) => row.userId === userId && row.isDefault)
      .map((row) => row.id);
  }

  private matches(row: AddressRow, where: Where): boolean {
    return Object.entries(where).every(
      ([key, value]) => row[key as keyof AddressRow] === value,
    );
  }

  /** addresses_one_default_per_user, checked after every statement. */
  private enforceIndex(): void {
    const seen = new Set<string>();
    for (const row of this.rows.filter((candidate) => candidate.isDefault)) {
      if (seen.has(row.userId)) {
        throw new Error('unique violation: addresses_one_default_per_user');
      }
      seen.add(row.userId);
    }
  }

  private write(row: AddressRow, data: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) (row as Record<string, unknown>)[key] = value;
    }
    row.updatedAt = this.now();
  }

  /** What a transaction callback receives: the same client, untyped here. */
  private transactionClient(): unknown {
    return this.client;
  }

  readonly client = {
    address: {
      count: jest.fn((args: { where: Where }) => {
        this.log.push('count');
        return Promise.resolve(
          this.rows.filter((row) => this.matches(row, args.where)).length,
        );
      }),
      findUnique: jest.fn((args: { where: { id: string } }) => {
        this.log.push('findUnique');
        const row = this.rows.find(
          (candidate) => candidate.id === args.where.id,
        );
        return Promise.resolve(row ? { ...row } : null);
      }),
      findFirst: jest.fn((args: { where: Where }) => {
        this.log.push('findFirst');
        const [first] = this.rows
          .filter((row) => this.matches(row, args.where))
          .sort(
            (a, b) =>
              b.updatedAt.getTime() - a.updatedAt.getTime() ||
              a.id.localeCompare(b.id),
          );
        return Promise.resolve(first ? { ...first } : null);
      }),
      create: jest.fn(
        (args: { data: Omit<AddressRow, 'id' | 'updatedAt'> }) => {
          this.log.push('create');
          this.sequence += 1;
          const row: AddressRow = {
            id: `addr-new-${this.sequence}`,
            updatedAt: this.now(),
            ...args.data,
          };
          this.rows.push(row);
          this.enforceIndex();
          return Promise.resolve({ ...row });
        },
      ),
      update: jest.fn(
        (args: { where: { id: string }; data: Record<string, unknown> }) => {
          this.log.push('update');
          const row = this.rows.find(
            (candidate) => candidate.id === args.where.id,
          );
          if (!row) return Promise.reject(new Error('record not found'));
          this.write(row, args.data);
          this.enforceIndex();
          return Promise.resolve({ ...row });
        },
      ),
      updateMany: jest.fn(
        (args: { where: Where; data: Record<string, unknown> }) => {
          this.log.push('updateMany');
          const targets = this.rows.filter((row) =>
            this.matches(row, args.where),
          );
          for (const row of targets) this.write(row, args.data);
          this.enforceIndex();
          return Promise.resolve({ count: targets.length });
        },
      ),
      delete: jest.fn((args: { where: { id: string } }) => {
        this.log.push('delete');
        const row = this.rows.find(
          (candidate) => candidate.id === args.where.id,
        );
        if (!row) return Promise.reject(new Error('record not found'));
        this.rows = this.rows.filter((candidate) => candidate !== row);
        return Promise.resolve({ ...row });
      }),
    },
    $queryRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const table = /FROM (\w+)/.exec(strings.join('?'))?.[1] ?? 'unknown';
        this.log.push(`lock ${table}:${String(values[0])}`);
        return Promise.resolve([{ id: values[0] }]);
      },
    ),
    $transaction: jest.fn(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const saved = structuredClone(this.rows);
        try {
          return await callback(this.transactionClient());
        } catch (error) {
          this.rows = saved;
          throw error;
        }
      },
    ),
  };
}

const dto: CreateAddressDto = {
  recipientName: 'A',
  line1: 'L1',
  city: 'C',
  postalCode: '00000',
  country: 'US',
};

describe('AddressesService default-address invariant', () => {
  let db: FakeAddressDb;
  let service: AddressesService;

  beforeEach(() => {
    db = new FakeAddressDb();
    service = new AddressesService(db.client as unknown as PrismaService);
  });

  it('defaults the first address only, and keeps it through later creates', async () => {
    const first = await service.create('user-1', dto);
    const second = await service.create('user-1', dto);
    const third = await service.create('user-1', dto);

    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(false);
    expect(third.isDefault).toBe(false);
    expect(db.defaultsOf('user-1')).toEqual([first.id]);
  });

  it('moves the default with setDefault without ever holding two', async () => {
    const first = await service.create('user-1', dto);
    const second = await service.create('user-1', dto);

    const moved = await service.setDefault('user-1', second.id);

    expect(moved).toMatchObject({ id: second.id, isDefault: true });
    expect(db.defaultsOf('user-1')).toEqual([second.id]);
    expect(db.rows.find((row) => row.id === first.id)?.isDefault).toBe(false);
  });

  it('promotes the most recently updated remaining address when the default is deleted', async () => {
    db.seed({ id: 'addr-a', userId: 'user-1', isDefault: true });
    db.seed({ id: 'addr-b', userId: 'user-1' });
    db.seed({ id: 'addr-c', userId: 'user-1' });
    // addr-b becomes the most recently updated.
    await service.update('user-1', 'addr-b', { city: 'Y' });

    await service.remove('user-1', 'addr-a');

    expect(db.defaultsOf('user-1')).toEqual(['addr-b']);
  });

  it('breaks an updatedAt tie by ascending id when promoting', async () => {
    const updatedAt = new Date(Date.UTC(2025, 0, 1));
    db.seed({ id: 'addr-a', userId: 'user-1', isDefault: true });
    db.seed({ id: 'addr-z', userId: 'user-1', updatedAt });
    db.seed({ id: 'addr-m', userId: 'user-1', updatedAt });

    await service.remove('user-1', 'addr-a');

    expect(db.defaultsOf('user-1')).toEqual(['addr-m']);
  });

  it('leaves no default once the last address is deleted', async () => {
    const only = await service.create('user-1', dto);

    await service.remove('user-1', only.id);

    expect(db.rows).toEqual([]);
  });

  it('keeps the default when a non-default address is deleted', async () => {
    db.seed({ id: 'addr-a', userId: 'user-1', isDefault: true });
    db.seed({ id: 'addr-b', userId: 'user-1' });
    db.seed({ id: 'addr-c', userId: 'user-1' });

    await service.remove('user-1', 'addr-c');

    expect(db.defaultsOf('user-1')).toEqual(['addr-a']);
  });

  describe('a legacy user with addresses but no default', () => {
    beforeEach(() => {
      db.seed({ id: 'addr-a', userId: 'user-1' });
      db.seed({ id: 'addr-b', userId: 'user-1' });
      db.seed({ id: 'addr-c', userId: 'user-1' });
      // Another user's rows must never be touched by the repair.
      db.seed({ id: 'addr-x', userId: 'user-2' });
    });

    it('is repaired by deleting a non-default address', async () => {
      await service.remove('user-1', 'addr-a');

      // addr-c is the most recently updated of the two left.
      expect(db.defaultsOf('user-1')).toEqual(['addr-c']);
      expect(db.defaultsOf('user-2')).toEqual([]);
    });

    it('is repaired by creating an address, which comes back as the default', async () => {
      const created = await service.create('user-1', dto);

      expect(created.isDefault).toBe(true);
      expect(db.defaultsOf('user-1')).toEqual([created.id]);
      expect(db.defaultsOf('user-2')).toEqual([]);
    });

    it('is repaired by setDefault', async () => {
      await service.setDefault('user-1', 'addr-a');

      expect(db.defaultsOf('user-1')).toEqual(['addr-a']);
    });

    it('is not repaired by update, which cannot touch the default flag', async () => {
      await service.update('user-1', 'addr-a', {
        city: 'Y',
        isDefault: true,
      } as never);

      expect(db.defaultsOf('user-1')).toEqual([]);
    });
  });

  it('never lets update unset the current default', async () => {
    const first = await service.create('user-1', dto);

    await service.update('user-1', first.id, {
      city: 'Y',
      isDefault: false,
    } as never);

    expect(db.defaultsOf('user-1')).toEqual([first.id]);
  });

  it('changes nothing when removing another user’s address', async () => {
    db.seed({ id: 'addr-x', userId: 'user-2', isDefault: true });
    const before = structuredClone(db.rows);

    await expect(service.remove('user-1', 'addr-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(db.rows).toEqual(before);
  });

  it.each([
    [
      'create',
      (s: AddressesService): Promise<unknown> => s.create('user-1', dto),
    ],
    [
      'update',
      (s: AddressesService): Promise<unknown> =>
        s.update('user-1', 'addr-a', { city: 'Y' }),
    ],
    [
      'setDefault',
      (s: AddressesService): Promise<unknown> =>
        s.setDefault('user-1', 'addr-b'),
    ],
    [
      'remove',
      (s: AddressesService): Promise<unknown> => s.remove('user-1', 'addr-a'),
    ],
  ])(
    '%s locks the users row before reading any address',
    async (_label, run) => {
      db.seed({ id: 'addr-a', userId: 'user-1', isDefault: true });
      db.seed({ id: 'addr-b', userId: 'user-1' });

      await run(service);

      expect(db.log[0]).toBe('lock users:user-1');
      expect(db.log.filter((entry) => entry.startsWith('lock'))).toEqual([
        'lock users:user-1',
      ]);
    },
  );

  it('holds the invariant across a long mixed sequence of mutations', async () => {
    // Deterministic pseudo-random sequence (Park-Miller), so a failure reproduces.
    let state = 42;
    const next = (bound: number): number => {
      state = (state * 48_271) % 2_147_483_647;
      return state % bound;
    };
    const users = ['user-1', 'user-2'];

    for (let step = 0; step < 300; step += 1) {
      const userId = users[next(users.length)]!;
      const own = db.rows.filter((row) => row.userId === userId);
      const target = own.length ? own[next(own.length)]!.id : undefined;
      const operation = target ? next(4) : 0;

      if (operation === 0) await service.create(userId, dto);
      else if (operation === 1) await service.remove(userId, target!);
      else if (operation === 2) await service.setDefault(userId, target!);
      else await service.update(userId, target!, { city: `C${step}` });

      for (const user of users) {
        const count = db.rows.filter((row) => row.userId === user).length;
        expect({ step, user, defaults: db.defaultsOf(user).length }).toEqual({
          step,
          user,
          defaults: count ? 1 : 0,
        });
      }
    }
  });
});
