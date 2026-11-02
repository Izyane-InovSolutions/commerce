import { randomUUID } from 'node:crypto';
import { Prisma, ProductStatus, Role } from '@prisma/client';

type Row = Record<string, unknown>;
/** Resolves a relation of a row, for nested `where` filters and `select`s. */
type Relations = Record<string, (row: Row) => unknown>;
type OrderBy =
  | Record<string, 'asc' | 'desc'>
  | Record<string, 'asc' | 'desc'>[];

const FILTER_OPERATORS = new Set([
  'equals',
  'in',
  'notIn',
  'not',
  'lt',
  'lte',
  'gt',
  'gte',
]);

function comparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value;
}

function matchesValue(value: unknown, condition: unknown): boolean {
  if (condition === null) return value === null || value === undefined;
  if (condition instanceof Date)
    return value instanceof Date && value.getTime() === condition.getTime();
  if (typeof condition !== 'object' || Array.isArray(condition))
    return value === condition;

  const operators = condition as Row;
  if (!Object.keys(operators).some((key) => FILTER_OPERATORS.has(key)))
    return JSON.stringify(value) === JSON.stringify(condition);
  return Object.entries(operators).every(([operator, operand]) => {
    if (operand === undefined) return true;
    const left = comparable(value) as number;
    const right = comparable(operand) as number;
    switch (operator) {
      case 'equals':
        return matchesValue(value, operand);
      case 'in':
        return (operand as unknown[]).some((item) => matchesValue(value, item));
      case 'notIn':
        return !(operand as unknown[]).some((item) =>
          matchesValue(value, item),
        );
      case 'not':
        return !matchesValue(value, operand);
      case 'lt':
        return value != null && left < right;
      case 'lte':
        return value != null && left <= right;
      case 'gt':
        return value != null && left > right;
      case 'gte':
        return value != null && left >= right;
      default:
        return true;
    }
  });
}

/**
 * The subset of Prisma's `where` the services under e2e use: equality,
 * null, the scalar operators above, AND/OR/NOT, and to-one relation filters
 * resolved through `relations`. Undefined conditions are ignored, as Prisma
 * ignores them.
 */
function matchesWhere(
  row: Row,
  where: Row | undefined,
  relations: Relations = {},
): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    const clauses = (): Row[] =>
      (Array.isArray(condition) ? condition : [condition]) as Row[];
    if (key === 'AND')
      return clauses().every((clause) => matchesWhere(row, clause, relations));
    if (key === 'OR')
      return clauses().some((clause) => matchesWhere(row, clause, relations));
    if (key === 'NOT')
      return !clauses().some((clause) => matchesWhere(row, clause, relations));
    const relation = relations[key];
    if (relation) {
      const related = relation(row) as Row | null | undefined;
      return !!related && matchesWhere(related, condition as Row);
    }
    return matchesValue(row[key], condition);
  });
}

function sortRows<T extends Row>(rows: T[], orderBy?: OrderBy): T[] {
  if (!orderBy) return rows;
  const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((entry) =>
    Object.entries(entry),
  );
  return [...rows].sort((left, right) => {
    for (const [key, direction] of keys) {
      const a = comparable(left[key]) as string | number | null | undefined;
      const b = comparable(right[key]) as string | number | null | undefined;
      if (a === b) continue;
      // Postgres sorts NULLs last ascending, first descending.
      const order = a == null ? 1 : b == null ? -1 : a < b ? -1 : 1;
      return direction === 'desc' ? -order : order;
    }
    return 0;
  });
}

/** A Prisma `select`: scalars by name, relations through `relations`. */
function project(row: Row, select: Row, relations: Relations = {}): Row {
  const projected: Row = {};
  for (const [key, spec] of Object.entries(select)) {
    if (!spec) continue;
    const relation = relations[key];
    const value = relation && !(key in row) ? relation(row) : row[key];
    const nested =
      typeof spec === 'object' ? ((spec as Row).select as Row) : undefined;
    if (!nested || value == null) projected[key] = value ?? null;
    else
      projected[key] = Array.isArray(value)
        ? (value as Row[]).map((item) => project(item, nested))
        : project(value as Row, nested);
  }
  return projected;
}

function omitKeys(row: Row, omit?: Row): Row {
  if (!omit) return row;
  const copy = { ...row };
  for (const [key, omitted] of Object.entries(omit))
    if (omitted) delete copy[key];
  return copy;
}

/**
 * Applies a Prisma update `data`: undefined values are skipped (Prisma
 * ignores them) and `{ increment }`/`{ decrement }`/`{ set }` are honoured.
 */
function applyData(row: Row, data: Row): Row {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const op = value as {
        increment?: number;
        decrement?: number;
        set?: unknown;
      };
      if (op.increment !== undefined) {
        row[key] = (row[key] as number) + op.increment;
        continue;
      }
      if (op.decrement !== undefined) {
        row[key] = (row[key] as number) - op.decrement;
        continue;
      }
      if ('set' in op) {
        row[key] = op.set;
        continue;
      }
    }
    row[key] = value;
  }
  return row;
}

function definedOnly(data: Row): Row {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
}

/** What Prisma throws for a unique violation, so `instanceof` checks hold. */
function uniqueViolation(
  target: string[],
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    `Unique constraint failed on the fields: (${target.join(',')})`,
    { code: 'P2002', clientVersion: 'fake', meta: { target } },
  );
}

/**
 * Deep copy of plain data (objects, arrays, Dates) for transaction
 * snapshots; anything else (class instances, buffers) is kept by reference.
 */
function cloneData<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value))
    return (value as unknown[]).map((item) => cloneData(item)) as T;
  if (
    value &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneData(item)]),
    ) as T;
  return value;
}

type FakeUser = {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: Role;
  isActive: boolean;
  emailVerifiedAt: Date | null;
  verificationGraceUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type FakeSession = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  familyId: string;
  familyCreatedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  lastUsedAt: Date;
  replacedBySessionId: string | null;
  recoveryData: string | null;
  recoveryExpiresAt: Date | null;
  createdAt: Date;
};

type FakePasswordResetToken = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

type FakeEmailVerificationToken = {
  id: string;
  userId: string;
  targetEmail: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

/**
 * A minimal in-memory stand-in for PrismaClient covering only the operations
 * AuthService uses, so auth e2e flows can run without a real database.
 */
export class FakePrismaService {
  private readonly users = new Map<string, FakeUser>();

  /**
   * An active, email-verified user with this id and role, unless one exists.
   * JwtAuthGuard now reads the session's user on every request (role,
   * activity and verification come from that row, not the token), so a
   * test token needs a real user behind it — see issueTestToken.
   */
  seedUser(id: string, role: Role): FakeUser {
    const existing = this.users.get(id);
    if (existing) return existing;
    const now = new Date();
    const user: FakeUser = {
      id,
      email: `${id}@test.local`,
      passwordHash: 'not-a-real-hash',
      firstName: null,
      lastName: null,
      phone: null,
      role,
      isActive: true,
      emailVerifiedAt: now,
      verificationGraceUntil: null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    return user;
  }
  private readonly sessions = new Map<string, FakeSession>();
  private readonly passwordResetTokens = new Map<
    string,
    FakePasswordResetToken
  >();
  private readonly emailVerificationTokens = new Map<
    string,
    FakeEmailVerificationToken
  >();
  private readonly emailDeliveries = new Map<string, Record<string, unknown>>();

  $connect(): Promise<void> {
    return Promise.resolve();
  }

  $disconnect(): Promise<void> {
    return Promise.resolve();
  }

  // Supports both Prisma $transaction forms: an array of already-started
  // operations, and a callback that receives a transaction client (here,
  // just `this` again — the fake has no isolation). A callback that throws
  // rolls the fake's data back to where it started, as a real transaction
  // would: services now write first and validate after (e.g. a cart add over
  // stock), relying on that rollback. Concurrent callbacks are not isolated
  // from each other, so specs should not overlap a failing transaction with
  // other writes.
  async $transaction<T>(
    arg: unknown[] | ((tx: this) => Promise<T>),
    options?: unknown,
  ): Promise<unknown> {
    void options;
    if (typeof arg !== 'function') return Promise.all(arg);

    const restore = this.snapshotState();
    try {
      return await arg(this);
    } catch (error) {
      restore();
      throw error;
    }
  }

  private snapshotState(): () => void {
    const restorers: (() => void)[] = [];
    for (const value of Object.values(this) as unknown[]) {
      if (value instanceof Map) {
        const entries = [...(value as Map<unknown, unknown>).entries()].map(
          ([key, item]) => [key, cloneData(item)] as const,
        );
        restorers.push(() => {
          value.clear();
          for (const [key, item] of entries) value.set(key, item);
        });
      } else if (Array.isArray(value)) {
        const items = cloneData(value as unknown[]);
        restorers.push(() => {
          value.length = 0;
          value.push(...items);
        });
      }
    }
    return () => restorers.forEach((restorer) => restorer());
  }

  // Row locks (`... FOR UPDATE` / `FOR KEY SHARE`) are no-ops here: the fake
  // runs one request's statements at a time. Only the legacy idempotency
  // receipt lookups (CheckoutAttemptsService) need an answer.
  $queryRaw(
    strings?: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown[]> {
    const sql = Array.isArray(strings) ? strings.join('?') : '';

    if (sql.includes('FROM checkout_attempts') && sql.includes('lower(key)')) {
      const [userId, key] = values as string[];
      return Promise.resolve(
        [...this.checkoutAttempts.values()]
          .filter(
            (row) =>
              row.userId === userId &&
              (row.key as string).toLowerCase() === key &&
              row.key !== key,
          )
          .slice(0, 1)
          .map((row) => ({ order_id: row.orderId ?? null })),
      );
    }

    if (sql.includes('FROM orders') && sql.includes('lower(idempotency_key)')) {
      const [userId, key] = values as string[];
      return Promise.resolve(
        [...this.orders.values()]
          .filter(
            (row) =>
              row.userId === userId &&
              typeof row.idempotencyKey === 'string' &&
              row.idempotencyKey.toLowerCase() === key,
          )
          .slice(0, 1)
          .map((row) => ({ id: row.id })),
      );
    }

    return Promise.resolve([]);
  }

  // Strictly increasing timestamps for rows whose (createdAt, id) order
  // matters (cart lines are allocated in it); Postgres keeps microseconds,
  // so two rows inserted in the same millisecond still sort by insertion.
  private lastTick = 0;
  private tick(): Date {
    this.lastTick = Math.max(Date.now(), this.lastTick + 1);
    return new Date(this.lastTick);
  }

  // Recognizes the small, fixed set of raw guarded-update queries
  // InventoryService issues, by matching the literal (placeholder-free) SQL
  // text — a full SQL engine isn't needed for four known shapes.
  $executeRaw(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number> {
    const sql = strings.join('');

    if (sql.includes('on_hand = on_hand +')) {
      const [delta, id] = [values[0] as number, values[1] as string];
      const record = this.inventoryRecords.get(id);
      if (!record || (record.onHand as number) + delta < 0)
        return Promise.resolve(0);
      record.onHand = (record.onHand as number) + delta;
      record.updatedAt = new Date();
      return Promise.resolve(1);
    }

    if (sql.includes('reserved = reserved +')) {
      const [quantity, id] = [values[0] as number, values[1] as string];
      const record = this.inventoryRecords.get(id);
      if (
        !record ||
        (record.onHand as number) - (record.reserved as number) < quantity
      )
        return Promise.resolve(0);
      record.reserved = (record.reserved as number) + quantity;
      record.updatedAt = new Date();
      return Promise.resolve(1);
    }

    if (sql.includes('on_hand = on_hand -')) {
      const [qty1, qty2, id] = [
        values[0] as number,
        values[1] as number,
        values[2] as string,
      ];
      const record = this.inventoryRecords.get(id);
      if (
        !record ||
        (record.onHand as number) < qty1 ||
        (record.reserved as number) < qty2
      )
        return Promise.resolve(0);
      record.onHand = (record.onHand as number) - qty1;
      record.reserved = (record.reserved as number) - qty2;
      record.updatedAt = new Date();
      return Promise.resolve(1);
    }

    if (sql.includes('SET reserved = reserved -')) {
      const [quantity, id] = [values[0] as number, values[1] as string];
      const record = this.inventoryRecords.get(id);
      if (!record || (record.reserved as number) < quantity)
        return Promise.resolve(0);
      record.reserved = (record.reserved as number) - quantity;
      return Promise.resolve(1);
    }

    if (sql.includes('GREATEST(reserved -')) {
      const [quantity, id] = [values[0] as number, values[1] as string];
      const record = this.inventoryRecords.get(id);
      if (record) {
        record.reserved = Math.max((record.reserved as number) - quantity, 0);
        record.updatedAt = new Date();
      }
      return Promise.resolve(1);
    }

    throw new Error(
      `FakePrismaService.$executeRaw: unrecognized query: ${sql}`,
    );
  }

  user = {
    findUnique: ({
      where,
    }: {
      where: { id?: string; email?: string };
    }): Promise<FakeUser | null> => {
      if (where.id) {
        return Promise.resolve(this.users.get(where.id) ?? null);
      }

      return Promise.resolve(
        [...this.users.values()].find((user) => user.email === where.email) ??
          null,
      );
    },
    create: ({
      data,
    }: {
      data: { email: string; passwordHash: string };
    }): Promise<FakeUser> => {
      const now = new Date();
      const user: FakeUser = {
        id: randomUUID(),
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: null,
        lastName: null,
        phone: null,
        role: Role.CUSTOMER,
        isActive: true,
        emailVerifiedAt: null,
        verificationGraceUntil: null,
        createdAt: now,
        updatedAt: now,
      };
      this.users.set(user.id, user);
      return Promise.resolve(user);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeUser>;
    }): Promise<FakeUser> => {
      const user = this.users.get(where.id);

      if (!user) {
        throw new Error(`Fake user ${where.id} not found`);
      }

      Object.assign(user, data, { updatedAt: new Date() });
      return Promise.resolve(user);
    },
    updateMany: ({
      where,
      data,
    }: {
      where: { id?: string; email?: string };
      data: Partial<FakeUser>;
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const user of this.users.values()) {
        if (where.id && user.id !== where.id) continue;
        if (where.email && user.email !== where.email) continue;
        Object.assign(user, data, { updatedAt: new Date() });
        count += 1;
      }
      return Promise.resolve({ count });
    },
  };

  session = {
    create: ({
      data,
    }: {
      data: {
        userId: string;
        refreshTokenHash: string;
        expiresAt: Date;
        familyId?: string;
        familyCreatedAt?: Date;
        ipAddress?: string;
        userAgent?: string;
      };
    }): Promise<FakeSession> => {
      const now = new Date();
      const session: FakeSession = {
        id: randomUUID(),
        userId: data.userId,
        refreshTokenHash: data.refreshTokenHash,
        expiresAt: data.expiresAt,
        revokedAt: null,
        revokedReason: null,
        familyId: data.familyId ?? randomUUID(),
        familyCreatedAt: data.familyCreatedAt ?? now,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        lastUsedAt: now,
        replacedBySessionId: null,
        recoveryData: null,
        recoveryExpiresAt: null,
        createdAt: now,
      };
      this.sessions.set(session.id, session);
      return Promise.resolve(session);
    },
    findUnique: ({
      where,
      include,
    }: {
      where: { id?: string; refreshTokenHash?: string };
      include?: { user?: boolean };
    }): Promise<(FakeSession & { user?: FakeUser }) | null> => {
      const withUser = (
        session: FakeSession | undefined,
      ): (FakeSession & { user?: FakeUser }) | null => {
        if (!session) return null;
        return include?.user
          ? { ...session, user: this.users.get(session.userId)! }
          : session;
      };
      if (where.id) {
        return Promise.resolve(withUser(this.sessions.get(where.id)));
      }

      return Promise.resolve(
        withUser(
          [...this.sessions.values()].find(
            (session) => session.refreshTokenHash === where.refreshTokenHash,
          ),
        ),
      );
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeSession>;
    }): Promise<FakeSession> => {
      const session = this.sessions.get(where.id);

      if (!session) {
        throw new Error(`Fake session ${where.id} not found`);
      }

      Object.assign(session, data);
      return Promise.resolve(session);
    },
    updateMany: ({
      where,
      data,
    }: {
      where: {
        id?: string;
        userId?: string;
        revokedAt?: null;
        expiresAt?: { gt: Date };
        familyId?: string | { not: string };
        lastUsedAt?: { lte: Date };
        OR?: Array<{ revokedAt?: null; revokedReason?: string }>;
      };
      data: Partial<FakeSession>;
    }): Promise<{ count: number }> => {
      let count = 0;

      for (const session of this.sessions.values()) {
        if (
          where.OR &&
          !where.OR.some(
            (alternative) =>
              ('revokedAt' in alternative && session.revokedAt === null) ||
              ('revokedReason' in alternative &&
                session.revokedReason === alternative.revokedReason),
          )
        )
          continue;
        if (where.id && session.id !== where.id) {
          continue;
        }
        if (where.userId && session.userId !== where.userId) {
          continue;
        }
        if (where.revokedAt === null && session.revokedAt !== null) {
          continue;
        }
        if (where.expiresAt?.gt && session.expiresAt <= where.expiresAt.gt) {
          continue;
        }
        if (
          typeof where.familyId === 'string' &&
          session.familyId !== where.familyId
        ) {
          continue;
        }
        if (
          typeof where.familyId === 'object' &&
          session.familyId === where.familyId.not
        ) {
          continue;
        }
        if (where.lastUsedAt && session.lastUsedAt > where.lastUsedAt.lte) {
          continue;
        }

        Object.assign(session, data);
        count += 1;
      }

      return Promise.resolve({ count });
    },
    findMany: ({
      where,
    }: {
      where: { userId: string; familyId?: string };
    }): Promise<FakeSession[]> => {
      return Promise.resolve(
        [...this.sessions.values()].filter(
          (session) =>
            session.userId === where.userId &&
            (!where.familyId || session.familyId === where.familyId) &&
            session.revokedAt === null &&
            session.expiresAt > new Date(),
        ),
      );
    },
  };

  passwordResetToken = {
    updateMany: ({
      where,
      data,
    }: {
      where: { id: string; usedAt: null; expiresAt: { gt: Date } };
      data: { usedAt: Date };
    }): Promise<{ count: number }> => {
      const row = this.passwordResetTokens.get(where.id);
      if (!row || row.usedAt || row.expiresAt <= where.expiresAt.gt)
        return Promise.resolve({ count: 0 });
      row.usedAt = data.usedAt;
      return Promise.resolve({ count: 1 });
    },

    create: ({
      data,
    }: {
      data: { userId: string; tokenHash: string; expiresAt: Date };
    }): Promise<FakePasswordResetToken> => {
      const record: FakePasswordResetToken = {
        id: randomUUID(),
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        usedAt: null,
        createdAt: new Date(),
      };
      this.passwordResetTokens.set(record.id, record);
      return Promise.resolve(record);
    },
    findUnique: ({
      where,
    }: {
      where: { tokenHash: string };
    }): Promise<FakePasswordResetToken | null> => {
      return Promise.resolve(
        [...this.passwordResetTokens.values()].find(
          (record) => record.tokenHash === where.tokenHash,
        ) ?? null,
      );
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakePasswordResetToken>;
    }): Promise<FakePasswordResetToken> => {
      const record = this.passwordResetTokens.get(where.id);

      if (!record) {
        throw new Error(`Fake password reset token ${where.id} not found`);
      }

      Object.assign(record, data);
      return Promise.resolve(record);
    },
  };

  emailVerificationToken = {
    create: ({
      data,
    }: {
      data: Omit<FakeEmailVerificationToken, 'id' | 'usedAt' | 'createdAt'>;
    }): Promise<FakeEmailVerificationToken> => {
      const row: FakeEmailVerificationToken = {
        id: randomUUID(),
        usedAt: null,
        createdAt: new Date(),
        ...data,
      };
      this.emailVerificationTokens.set(row.id, row);
      return Promise.resolve(row);
    },
    findUnique: ({
      where,
    }: {
      where: { id?: string; tokenHash?: string };
    }): Promise<FakeEmailVerificationToken | null> => {
      if (where.id) {
        return Promise.resolve(
          this.emailVerificationTokens.get(where.id) ?? null,
        );
      }
      return Promise.resolve(
        [...this.emailVerificationTokens.values()].find(
          (row) => row.tokenHash === where.tokenHash,
        ) ?? null,
      );
    },
    findFirst: ({
      where,
    }: {
      where: {
        userId: string;
        targetEmail: string;
        createdAt: { gt: Date };
      };
    }): Promise<FakeEmailVerificationToken | null> =>
      Promise.resolve(
        [...this.emailVerificationTokens.values()].find(
          (row) =>
            row.userId === where.userId &&
            row.targetEmail === where.targetEmail &&
            row.createdAt > where.createdAt.gt,
        ) ?? null,
      ),
    updateMany: ({
      where,
      data,
    }: {
      where: {
        id?: string;
        userId?: string;
        targetEmail?: string;
        usedAt?: null;
        expiresAt?: { gt: Date };
      };
      data: { usedAt: Date };
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of this.emailVerificationTokens.values()) {
        if (where.id && row.id !== where.id) continue;
        if (where.userId && row.userId !== where.userId) continue;
        if (where.targetEmail && row.targetEmail !== where.targetEmail)
          continue;
        if (where.usedAt === null && row.usedAt !== null) continue;
        if (where.expiresAt && row.expiresAt <= where.expiresAt.gt) continue;
        row.usedAt = data.usedAt;
        count += 1;
      }
      return Promise.resolve({ count });
    },
  };

  emailDelivery = {
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        status: 'PENDING',
        id: randomUUID(),
        sentAt: null,
        failedAt: null,
        lastErrorCode: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.emailDeliveries.set(row.id as string, row);
      return Promise.resolve(row);
    },
  };

  auditEvent = {
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const record = { id: randomUUID(), createdAt: new Date(), ...data };
      return Promise.resolve(record);
    },
  };

  // --- Catalog (Phase 1.1) -------------------------------------------------
  // Loose, dynamic-record collections: catalog e2e coverage only needs enough
  // fidelity to exercise the admin-create -> publish -> public-list pipeline,
  // not a full relational engine.
  private readonly categories = new Map<string, Record<string, unknown>>();
  private readonly brands = new Map<string, Record<string, unknown>>();
  private readonly attributes = new Map<string, Record<string, unknown>>();
  private readonly attributeValues = new Map<string, Record<string, unknown>>();
  private readonly mediaAssets = new Map<string, Record<string, unknown>>();
  private readonly products = new Map<string, Record<string, unknown>>();
  private readonly productVariants = new Map<string, Record<string, unknown>>();
  private readonly variantAttributeValues: {
    variantId: string;
    attributeValueId: string;
  }[] = [];
  private readonly productMediaRows = new Map<
    string,
    Record<string, unknown>
  >();
  private readonly offers = new Map<string, Record<string, unknown>>();
  private readonly prices = new Map<string, Record<string, unknown>>();

  private attributeValueDetail(id: string): Record<string, unknown> {
    const value = this.attributeValues.get(id);
    const attribute = this.attributes.get(value?.attributeId as string);
    return { ...value, attribute };
  }

  private variantDetail(
    id: string,
    publicOnly = false,
  ): Record<string, unknown> {
    const variant = this.productVariants.get(id)!;
    const attributeValues = this.variantAttributeValues
      .filter((row) => row.variantId === id)
      .map((row) => ({
        ...row,
        attributeValue: this.attributeValueDetail(row.attributeValueId),
      }));
    const offers = [...this.offers.values()]
      .filter((offer) => offer.variantId === id)
      .filter(
        (offer) => !publicOnly || offer.status === ProductStatus.PUBLISHED,
      )
      .map((offer) => ({
        ...offer,
        prices: [...this.prices.values()].filter(
          (price) => price.offerId === offer.id,
        ),
      }));
    return { ...variant, attributeValues, offers };
  }

  // ProductsService always pairs a top-level `status: PUBLISHED` filter with
  // nested `variants`/`offers` filtered the same way for its public queries,
  // and never filters by status at all for admin queries — so the top-level
  // status alone tells us whether to also filter the nested collections.
  private productDetail(
    id: string,
    publicOnly = false,
  ): Record<string, unknown> | undefined {
    const product = this.products.get(id);
    if (!product) return undefined;
    const variants = [...this.productVariants.values()]
      .filter((variant) => variant.productId === id)
      .filter(
        (variant) => !publicOnly || variant.status === ProductStatus.PUBLISHED,
      )
      .map((variant) => this.variantDetail(variant.id as string, publicOnly));
    const media = [...this.productMediaRows.values()]
      .filter((row) => row.productId === id)
      .sort((a, b) => (a.position as number) - (b.position as number))
      .map((row) => ({
        ...row,
        mediaAsset: this.mediaAssets.get(row.mediaAssetId as string),
      }));
    return {
      ...product,
      brand: product.brandId
        ? (this.brands.get(product.brandId as string) ?? null)
        : null,
      category: product.categoryId
        ? (this.categories.get(product.categoryId as string) ?? null)
        : null,
      variants,
      media,
    };
  }

  category = {
    findMany: (): Promise<Record<string, unknown>[]> =>
      Promise.resolve([...this.categories.values()]),
    findUnique: ({
      where,
    }: {
      where: { id?: string; slug?: string };
    }): Promise<Record<string, unknown> | null> => {
      const row = where.id
        ? this.categories.get(where.id)
        : [...this.categories.values()].find(
            (category) => category.slug === where.slug,
          );
      if (!row) return Promise.resolve(null);
      const children = [...this.categories.values()].filter(
        (category) => category.parentId === row.id,
      );
      return Promise.resolve({ ...row, children });
    },
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        position: 0,
        parentId: null,
        description: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.categories.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.categories.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.categories.delete(where.id);
      return Promise.resolve();
    },
  };

  brand = {
    findMany: (): Promise<Record<string, unknown>[]> =>
      Promise.resolve([...this.brands.values()]),
    findUnique: ({
      where,
    }: {
      where: { id?: string; slug?: string };
    }): Promise<Record<string, unknown> | null> => {
      const row = where.id
        ? this.brands.get(where.id)
        : [...this.brands.values()].find((brand) => brand.slug === where.slug);
      return Promise.resolve(row ?? null);
    },
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        description: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.brands.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.brands.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.brands.delete(where.id);
      return Promise.resolve();
    },
  };

  // No e2e flow attaches attributes to a category, so every category reads
  // as unrestricted; the rules themselves are covered by unit specs.
  categoryAttribute = {
    findMany: (): Promise<Record<string, unknown>[]> => Promise.resolve([]),
  };

  attribute = {
    findMany: (): Promise<Record<string, unknown>[]> =>
      Promise.resolve(
        [...this.attributes.values()].map((attribute) => ({
          ...attribute,
          values: [...this.attributeValues.values()].filter(
            (value) => value.attributeId === attribute.id,
          ),
        })),
      ),
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> => {
      const row = this.attributes.get(where.id);
      if (!row) return Promise.resolve(null);
      return Promise.resolve({
        ...row,
        values: [...this.attributeValues.values()].filter(
          (value) => value.attributeId === row.id,
        ),
      });
    },
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = { id: randomUUID(), createdAt: now, updatedAt: now, ...data };
      this.attributes.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.attributes.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.attributes.delete(where.id);
      return Promise.resolve();
    },
  };

  attributeValue = {
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(this.attributeValues.get(where.id) ?? null),
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.attributeValues.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.attributeValues.get(where.id)!;
      Object.assign(row, data);
      return Promise.resolve(row);
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.attributeValues.delete(where.id);
      return Promise.resolve();
    },
  };

  mediaAsset = {
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(this.mediaAssets.get(where.id) ?? null),
    // Test seam: not a real Prisma method, used by e2e tests to seed an
    // AVAILABLE media asset without going through the media upload flow.
    __seed: (row: Record<string, unknown>): void => {
      this.mediaAssets.set(row.id as string, row);
    },
  };

  product = {
    findMany: ({ where }: { where?: Record<string, unknown> } = {}): Promise<
      Record<string, unknown>[]
    > => {
      const publicOnly = where?.status === ProductStatus.PUBLISHED;
      const rows = [...this.products.keys()]
        .map((id) => this.productDetail(id, publicOnly)!)
        .filter((row) => this.matchesProductWhere(row, where));
      return Promise.resolve(rows);
    },
    findFirst: ({
      where,
    }: {
      where: Record<string, unknown>;
    }): Promise<Record<string, unknown> | null> => {
      const publicOnly = where.status === ProductStatus.PUBLISHED;
      const row = [...this.products.keys()]
        .map((id) => this.productDetail(id, publicOnly)!)
        .find((candidate) => this.matchesProductWhere(candidate, where));
      return Promise.resolve(row ?? null);
    },
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(this.productDetail(where.id) ?? null),
    count: ({
      where,
    }: { where?: Record<string, unknown> } = {}): Promise<number> => {
      const publicOnly = where?.status === ProductStatus.PUBLISHED;
      const rows = [...this.products.keys()]
        .map((id) => this.productDetail(id, publicOnly)!)
        .filter((row) => this.matchesProductWhere(row, where));
      return Promise.resolve(rows.length);
    },
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        status: ProductStatus.DRAFT,
        description: null,
        brandId: null,
        categoryId: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.products.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.products.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.products.delete(where.id);
      return Promise.resolve();
    },
  };

  private matchesProductWhere(
    row: Record<string, unknown>,
    where?: Record<string, unknown>,
  ): boolean {
    if (!where) return true;

    if (where.status && row.status !== where.status) return false;

    const category = where.category as { slug?: string } | undefined;
    if (
      category?.slug &&
      (row.category as { slug?: string } | null)?.slug !== category.slug
    )
      return false;

    const brand = where.brand as { slug?: string } | undefined;
    if (
      brand?.slug &&
      (row.brand as { slug?: string } | null)?.slug !== brand.slug
    )
      return false;

    if (
      typeof row.slug !== 'undefined' &&
      where.slug &&
      row.slug !== where.slug
    )
      return false;

    return true;
  }

  productVariant = {
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> => {
      if (!this.productVariants.has(where.id)) return Promise.resolve(null);
      return Promise.resolve(this.variantDetail(where.id));
    },
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        status: ProductStatus.DRAFT,
        name: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.productVariants.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.productVariants.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.productVariants.delete(where.id);
      return Promise.resolve();
    },
  };

  productVariantAttributeValue = {
    createMany: ({
      data,
    }: {
      data: { variantId: string; attributeValueId: string }[];
    }): Promise<{ count: number }> => {
      this.variantAttributeValues.push(...data);
      return Promise.resolve({ count: data.length });
    },
    deleteMany: ({
      where,
    }: {
      where: { variantId: string };
    }): Promise<{ count: number }> => {
      const remaining = this.variantAttributeValues.filter(
        (row) => row.variantId !== where.variantId,
      );
      const removed = this.variantAttributeValues.length - remaining.length;
      this.variantAttributeValues.length = 0;
      this.variantAttributeValues.push(...remaining);
      return Promise.resolve({ count: removed });
    },
  };

  productMedia = {
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(this.productMediaRows.get(where.id) ?? null),
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = {
        id: randomUUID(),
        position: 0,
        isPrimary: false,
        createdAt: new Date(),
        ...data,
      };
      this.productMediaRows.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.productMediaRows.get(where.id)!;
      Object.assign(row, data);
      return Promise.resolve(row);
    },
    updateMany: ({
      where,
      data,
    }: {
      where: { productId: string };
      data: Record<string, unknown>;
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of this.productMediaRows.values()) {
        if (row.productId === where.productId) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return Promise.resolve({ count });
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.productMediaRows.delete(where.id);
      return Promise.resolve();
    },
  };

  // --- Sellers (marketplace) -----------------------------------------------
  // Minimal: just enough for Cart/Orders to read offer.seller?.status when an
  // offer has a sellerId. Not a full sellers-module fake.
  private readonly sellers = new Map<string, Record<string, unknown>>();

  private attachSeller(
    offer: Record<string, unknown>,
  ): Record<string, unknown> {
    const sellerId = offer.sellerId as string | undefined;
    return {
      ...offer,
      seller: sellerId ? (this.sellers.get(sellerId) ?? null) : null,
    };
  }

  seller = {
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = { id: randomUUID(), createdAt: now, updatedAt: now, ...data };
      this.sellers.set(row.id as string, row);
      return Promise.resolve(row);
    },
  };

  offer = {
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> => {
      const row = this.offers.get(where.id);
      if (!row) return Promise.resolve(null);
      return Promise.resolve(
        this.attachSeller({
          ...row,
          prices: [...this.prices.values()].filter(
            (price) => price.offerId === row.id,
          ),
        }),
      );
    },
    findMany: ({
      where,
    }: {
      where?: { id?: { in: string[] } };
    } = {}): Promise<Record<string, unknown>[]> => {
      let rows = [...this.offers.values()];
      if (where?.id?.in)
        rows = rows.filter((row) => where.id!.in.includes(row.id as string));
      return Promise.resolve(
        rows.map((row) =>
          this.attachSeller({
            ...row,
            prices: [...this.prices.values()].filter(
              (price) => price.offerId === row.id,
            ),
          }),
        ),
      );
    },
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        status: ProductStatus.DRAFT,
        // Mirrors the schema's @default(PLATFORM)/@default(NEW) - offers
        // created without an explicit sellerId are first-party.
        sellerId: null,
        condition: 'NEW',
        stockSource: 'PLATFORM',
        fulfillmentMode: 'PLATFORM',
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.offers.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.offers.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.offers.delete(where.id);
      return Promise.resolve();
    },
  };

  price = {
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      // Real Prisma treats an explicit `undefined` value as "field not
      // provided" (schema defaults still apply); a naive spread below would
      // instead let it clobber the default, so strip undefined keys first.
      data = Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      );
      const row = {
        id: randomUUID(),
        startsAt: new Date(),
        endsAt: null,
        createdAt: new Date(),
        ...data,
      };
      this.prices.set(row.id as string, row);
      return Promise.resolve(row);
    },
  };

  // --- Inventory (Phase 1.2) ------------------------------------------------
  private readonly warehouses = new Map<string, Record<string, unknown>>();
  private readonly inventoryRecords = new Map<
    string,
    Record<string, unknown>
  >();
  private readonly inventoryMovements = new Map<
    string,
    Record<string, unknown>
  >();
  private readonly reservations = new Map<string, Record<string, unknown>>();
  private readonly backgroundJobs = new Map<string, Record<string, unknown>>();
  private readonly outboxEvents = new Map<string, Record<string, unknown>>();

  warehouse = {
    findMany: (): Promise<Record<string, unknown>[]> =>
      Promise.resolve([...this.warehouses.values()]),
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(this.warehouses.get(where.id) ?? null),
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        isActive: true,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.warehouses.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.warehouses.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.warehouses.delete(where.id);
      return Promise.resolve();
    },
  };

  inventoryRecord = {
    findUnique: ({
      where,
    }: {
      where: {
        id?: string;
        offerId?: string;
        warehouseId_variantId?: { warehouseId: string; variantId: string };
      };
    }): Promise<Record<string, unknown> | null> => {
      if (where.id)
        return Promise.resolve(this.inventoryRecords.get(where.id) ?? null);
      if (where.offerId) {
        const row = [...this.inventoryRecords.values()].find(
          (record) => record.offerId === where.offerId,
        );
        return Promise.resolve(row ?? null);
      }
      const { warehouseId, variantId } = where.warehouseId_variantId!;
      const row = [...this.inventoryRecords.values()].find(
        (r) => r.warehouseId === warehouseId && r.variantId === variantId,
      );
      return Promise.resolve(row ?? null);
    },
    findUniqueOrThrow: async (args: {
      where: {
        id?: string;
        offerId?: string;
        warehouseId_variantId?: { warehouseId: string; variantId: string };
      };
    }): Promise<Record<string, unknown>> => {
      const row = await this.inventoryRecord.findUnique(args);
      if (!row) throw new Error('InventoryRecord not found');
      return row;
    },
    findMany: ({
      where,
      select,
      orderBy,
    }: {
      where?: Row;
      select?: Row;
      orderBy?: OrderBy;
    } = {}): Promise<Record<string, unknown>[]> => {
      const rows = sortRows(
        [...this.inventoryRecords.values()].filter((row) =>
          matchesWhere(row, where),
        ),
        orderBy,
      );
      return Promise.resolve(
        rows.map((row) => (select ? project(row, select) : { ...row })),
      );
    },
    create: ({
      data,
    }: {
      data: { warehouseId?: string; offerId?: string; variantId: string };
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        onHand: 0,
        reserved: 0,
        version: 0,
        warehouseId: null,
        offerId: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.inventoryRecords.set(row.id, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.inventoryRecords.get(where.id)!;
      const increments: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'object' && 'increment' in value) {
          increments[key] =
            (row[key] as number) + (value as { increment: number }).increment;
        } else {
          increments[key] = value;
        }
      }
      Object.assign(row, increments, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
    updateMany: ({
      where,
      data,
    }: {
      where: { id: string; version?: number; reserved?: { lte: number } };
      data: Record<string, unknown>;
    }): Promise<{ count: number }> => {
      const row = this.inventoryRecords.get(where.id);
      if (
        !row ||
        (where.version !== undefined && row.version !== where.version) ||
        (where.reserved && (row.reserved as number) > where.reserved.lte)
      )
        return Promise.resolve({ count: 0 });
      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'object' && 'increment' in value)
          row[key] =
            (row[key] as number) + (value as { increment: number }).increment;
        else row[key] = value;
      }
      row.updatedAt = new Date();
      return Promise.resolve({ count: 1 });
    },
  };

  inventoryMovement = {
    findFirst: ({
      where,
    }: {
      where: Record<string, unknown>;
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(
        [...this.inventoryMovements.values()].find((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ) ?? null,
      ),

    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = {
        id: randomUUID(),
        note: null,
        referenceType: null,
        referenceId: null,
        createdAt: new Date(),
        ...data,
      };
      this.inventoryMovements.set(row.id as string, row);
      return Promise.resolve(row);
    },
    findMany: ({
      where,
    }: {
      where: { inventoryRecordId: string };
    }): Promise<Record<string, unknown>[]> =>
      Promise.resolve(
        [...this.inventoryMovements.values()].filter(
          (row) => row.inventoryRecordId === where.inventoryRecordId,
        ),
      ),
  };

  reservation = {
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(this.reservations.get(where.id) ?? null),
    findMany: ({
      where,
      select,
      orderBy,
    }: {
      where?: Row;
      select?: Row;
      orderBy?: OrderBy;
    } = {}): Promise<Record<string, unknown>[]> => {
      const rows = sortRows(
        [...this.reservations.values()].filter((row) =>
          matchesWhere(row, where),
        ),
        orderBy,
      );
      return Promise.resolve(
        rows.map((row) => (select ? project(row, select) : { ...row })),
      );
    },
    groupBy: ({
      by,
      where,
      _sum,
    }: {
      by: string[];
      where?: Row;
      _sum?: Record<string, boolean>;
    }): Promise<Record<string, unknown>[]> => {
      const groups = new Map<string, Row>();
      for (const row of this.reservations.values()) {
        if (!matchesWhere(row, where)) continue;
        const groupKey = JSON.stringify(by.map((field) => row[field]));
        const group = groups.get(groupKey) ?? {
          ...Object.fromEntries(by.map((field) => [field, row[field]])),
          _sum: Object.fromEntries(
            Object.keys(_sum ?? {}).map((field) => [field, 0]),
          ),
        };
        const sums = group._sum as Record<string, number>;
        for (const field of Object.keys(_sum ?? {}))
          sums[field] = (sums[field] ?? 0) + (row[field] as number);
        groups.set(groupKey, group);
      }
      return Promise.resolve([...groups.values()]);
    },
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        status: 'ACTIVE',
        holderType: null,
        holderId: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.reservations.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.reservations.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
  };

  private matchesJobClause(
    row: Record<string, unknown>,
    clause: Record<string, unknown>,
  ): boolean {
    return Object.entries(clause).every(([key, value]) => {
      if (value && typeof value === 'object' && 'lte' in value) {
        const rowValue = row[key];
        return (
          rowValue instanceof Date &&
          rowValue.getTime() <= (value as { lte: Date }).lte.getTime()
        );
      }
      return row[key] === value;
    });
  }

  backgroundJob = {
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      // Same "strip undefined so defaults apply" fix as price.create above.
      data = Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      );
      const now = new Date();
      const row = {
        id: randomUUID(),
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 5,
        runAt: now,
        lockedAt: null,
        lockToken: null,
        lastError: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.backgroundJobs.set(row.id as string, row);
      return Promise.resolve(row);
    },
    findFirst: ({
      where,
    }: {
      where: Record<string, unknown> & { OR?: Record<string, unknown>[] };
    }): Promise<Record<string, unknown> | null> => {
      const { OR, ...rest } = where;
      const rows = [...this.backgroundJobs.values()]
        .filter((row) =>
          OR
            ? OR.some((clause) => this.matchesJobClause(row, clause))
            : this.matchesJobClause(row, rest),
        )
        .sort(
          (a, b) =>
            (a.runAt as Date).getTime() - (b.runAt as Date).getTime() ||
            (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime(),
        );
      return Promise.resolve(rows[0] ?? null);
    },
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(this.backgroundJobs.get(where.id) ?? null),
    updateMany: ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of this.backgroundJobs.values()) {
        if (!this.matchesJobClause(row, where)) continue;

        for (const [key, value] of Object.entries(data)) {
          row[key] =
            value && typeof value === 'object' && 'increment' in value
              ? (row[key] as number) +
                (value as { increment: number }).increment
              : value;
        }
        row.updatedAt = new Date();
        count += 1;
      }
      return Promise.resolve({ count });
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.backgroundJobs.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
  };

  // No e2e spec provisions fulfillment through this fake yet — only
  // OrdersService's fulfillmentSummary lookup (always an empty result,
  // i.e. "still PREPARING") needs a fake here.
  fulfillmentOrder = {
    findMany: (): Promise<Record<string, unknown>[]> => Promise.resolve([]),
  };

  // Write-only here: nothing in the app yet consumes pending outbox rows
  // (see OutboxService), so only `create` — what OutboxService.record()
  // calls — needs a fake.
  outboxEvent = {
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 10,
        availableAt: now,
        publishedAt: null,
        lastError: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.outboxEvents.set(row.id as string, row);
      return Promise.resolve(row);
    },
  };

  // --- Users / addresses (Phase 1.3) ---------------------------------------
  private readonly addresses = new Map<string, Record<string, unknown>>();

  address = {
    findMany: ({
      where,
      orderBy,
    }: {
      where?: Row;
      orderBy?: OrderBy;
    }): Promise<Record<string, unknown>[]> =>
      Promise.resolve(
        sortRows(
          [...this.addresses.values()].filter((row) =>
            matchesWhere(row, where),
          ),
          orderBy,
        ),
      ),
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(this.addresses.get(where.id) ?? null),
    findFirst: ({
      where,
      orderBy = { updatedAt: 'desc' },
    }: {
      where?: Row;
      orderBy?: OrderBy;
    }): Promise<Record<string, unknown> | null> => {
      const rows = sortRows(
        [...this.addresses.values()].filter((row) => matchesWhere(row, where)),
        orderBy,
      );
      return Promise.resolve(rows[0] ?? null);
    },
    count: ({ where }: { where?: Row }): Promise<number> =>
      Promise.resolve(
        [...this.addresses.values()].filter((row) => matchesWhere(row, where))
          .length,
      ),
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        label: null,
        phone: null,
        line2: null,
        region: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.addresses.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.addresses.get(where.id)!;
      applyData(row, { ...data, updatedAt: new Date() });
      return Promise.resolve(row);
    },
    updateMany: ({
      where,
      data,
    }: {
      where?: Row;
      data: Record<string, unknown>;
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of this.addresses.values()) {
        if (matchesWhere(row, where)) {
          applyData(row, { ...data, updatedAt: new Date() });
          count += 1;
        }
      }
      return Promise.resolve({ count });
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.addresses.delete(where.id);
      return Promise.resolve();
    },
  };

  // --- Cart / wishlist (Phase 1.4) -----------------------------------------
  private readonly carts = new Map<string, Record<string, unknown>>();
  private readonly cartItems = new Map<string, Record<string, unknown>>();
  private readonly wishlistItems = new Map<string, Record<string, unknown>>();

  private offerWithPrices(
    offerId: string,
  ): Record<string, unknown> | undefined {
    const offer = this.offers.get(offerId);
    if (!offer) return undefined;
    return this.attachSeller({
      ...offer,
      prices: [...this.prices.values()].filter(
        (price) => price.offerId === offerId,
      ),
    });
  }

  private cartDetail(id: string): Record<string, unknown> | undefined {
    const cart = this.carts.get(id);
    if (!cart) return undefined;
    const items = [...this.cartItems.values()]
      .filter((item) => item.cartId === id)
      .map((item) => ({
        ...item,
        offer: this.offerWithPrices(item.offerId as string),
      }));
    return { ...cart, items };
  }

  cart = {
    findUnique: ({
      where,
    }: {
      where: { id?: string; userId?: string; guestToken?: string };
    }): Promise<Record<string, unknown> | null> => {
      if (where.id) {
        return Promise.resolve(this.cartDetail(where.id) ?? null);
      }
      const row = [...this.carts.values()].find(
        (cart) =>
          (where.userId && cart.userId === where.userId) ||
          (where.guestToken && cart.guestToken === where.guestToken),
      );
      if (!row) return Promise.resolve(null);
      return Promise.resolve(this.cartDetail(row.id as string) ?? null);
    },
    findUniqueOrThrow: async (args: {
      where: { id?: string; userId?: string; guestToken?: string };
    }): Promise<Record<string, unknown>> => {
      const row = await this.cart.findUnique(args);
      if (!row) throw new Error('No Cart found');
      return row;
    },
    findFirst: ({
      where,
    }: {
      where: { userId?: string; guestToken?: string; status?: string };
    }): Promise<Record<string, unknown> | null> => {
      const row = [...this.carts.values()].find(
        (cart) =>
          ((where.userId && cart.userId === where.userId) ||
            (where.guestToken && cart.guestToken === where.guestToken)) &&
          (!where.status || cart.status === where.status),
      );
      return Promise.resolve(row ?? null);
    },
    create: ({
      data,
    }: {
      data: { userId?: string; guestToken?: string };
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        userId: null,
        guestToken: null,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.carts.set(row.id, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.carts.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
  };

  private readonly cartItemRelations: Relations = {
    cart: (row) => this.carts.get(row.cartId as string),
  };

  private findCartItemRow(where: {
    id?: string;
    cartId_offerId?: { cartId: string; offerId: string };
  }): Record<string, unknown> | undefined {
    if (where.id) return this.cartItems.get(where.id);
    const { cartId, offerId } = where.cartId_offerId!;
    return [...this.cartItems.values()].find(
      (item) => item.cartId === cartId && item.offerId === offerId,
    );
  }

  private findCartItemRows(where?: Row, orderBy?: OrderBy): Row[] {
    return sortRows(
      [...this.cartItems.values()].filter((row) =>
        matchesWhere(row, where, this.cartItemRelations),
      ),
      orderBy,
    );
  }

  cartItem = {
    findUnique: ({
      where,
    }: {
      where: {
        id?: string;
        cartId_offerId?: { cartId: string; offerId: string };
      };
    }): Promise<Record<string, unknown> | null> => {
      const row = this.findCartItemRow(where);
      return Promise.resolve(row ? { ...row } : null);
    },
    findFirst: ({
      where,
      orderBy,
    }: {
      where?: Row;
      orderBy?: OrderBy;
    }): Promise<Record<string, unknown> | null> => {
      const row = this.findCartItemRows(where, orderBy)[0];
      return Promise.resolve(row ? { ...row } : null);
    },
    findMany: ({
      where,
      select,
      orderBy,
    }: {
      where?: Row;
      select?: Row;
      orderBy?: OrderBy;
    } = {}): Promise<Record<string, unknown>[]> =>
      Promise.resolve(
        this.findCartItemRows(where, orderBy).map((row) =>
          select ? project(row, select, this.cartItemRelations) : { ...row },
        ),
      ),
    upsert: ({
      where,
      create,
      update,
    }: {
      where: { cartId_offerId: { cartId: string; offerId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const existing = this.findCartItemRow(where);

      if (existing) {
        applyData(existing, { ...update, updatedAt: new Date() });
        return Promise.resolve({ ...existing });
      }

      const now = this.tick();
      const row = {
        id: randomUUID(),
        revision: 0,
        createdAt: now,
        updatedAt: now,
        ...definedOnly(create),
      };
      this.cartItems.set(row.id, row);
      return Promise.resolve({ ...row });
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.cartItems.get(where.id)!;
      applyData(row, { ...data, updatedAt: new Date() });
      return Promise.resolve({ ...row });
    },
    delete: ({ where }: { where: { id: string } }): Promise<void> => {
      this.cartItems.delete(where.id);
      return Promise.resolve();
    },
    deleteMany: ({ where }: { where?: Row }): Promise<{ count: number }> => {
      const doomed = this.findCartItemRows(where);
      for (const row of doomed) this.cartItems.delete(row.id as string);
      return Promise.resolve({ count: doomed.length });
    },
  };

  wishlistItem = {
    findMany: ({
      where,
    }: {
      where: { userId: string };
    }): Promise<Record<string, unknown>[]> =>
      Promise.resolve(
        [...this.wishlistItems.values()]
          .filter((item) => item.userId === where.userId)
          .map((item) => ({
            ...item,
            offer: this.offerWithPrices(item.offerId as string),
          })),
      ),
    create: ({
      data,
    }: {
      data: { userId: string; offerId: string };
    }): Promise<Record<string, unknown>> => {
      const duplicate = [...this.wishlistItems.values()].some(
        (item) => item.userId === data.userId && item.offerId === data.offerId,
      );
      if (duplicate) {
        return Promise.reject(
          Object.assign(new Error('Unique constraint violation'), {
            code: 'P2002',
          }),
        );
      }
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.wishlistItems.set(row.id, row);
      return Promise.resolve(row);
    },
    deleteMany: ({
      where,
    }: {
      where: { userId: string; offerId: string };
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const [id, item] of this.wishlistItems.entries()) {
        if (item.userId === where.userId && item.offerId === where.offerId) {
          this.wishlistItems.delete(id);
          count += 1;
        }
      }
      return Promise.resolve({ count });
    },
  };

  // --- Orders / payments (Phase 1.5) ---------------------------------------
  private readonly orders = new Map<string, Record<string, unknown>>();
  private readonly orderItems = new Map<string, Record<string, unknown>>();
  private readonly sellerOrders = new Map<string, Record<string, unknown>>();
  private readonly shippingGroups = new Map<string, Record<string, unknown>>();
  private readonly payments = new Map<string, Record<string, unknown>>();
  private readonly paymentEvents = new Map<string, Record<string, unknown>>();

  private orderDetail(id: string): Record<string, unknown> | undefined {
    const order = this.orders.get(id);
    if (!order) return undefined;
    const items = [...this.orderItems.values()].filter(
      (item) => item.orderId === id,
    );
    const sellerOrders = [...this.sellerOrders.values()]
      .filter((sellerOrder) => sellerOrder.orderId === id)
      .map((sellerOrder) => ({
        ...sellerOrder,
        items: [...this.orderItems.values()].filter(
          (item) => item.sellerOrderId === sellerOrder.id,
        ),
        shippingGroups: [...this.shippingGroups.values()]
          .filter((group) => group.sellerOrderId === sellerOrder.id)
          .map((group) => ({
            ...group,
            items: [...this.orderItems.values()].filter(
              (item) => item.shippingGroupId === group.id,
            ),
          })),
      }));
    return { ...order, items, sellerOrders };
  }

  private readonly orderRelations = {
    payment: (row: Row): unknown =>
      [...this.payments.values()].find(
        (payment) => payment.orderId === row.id,
      ) ?? null,
  } satisfies Relations;

  /**
   * An order read shaped by its args: `select` projects the row; otherwise
   * the detail (items, seller orders — always attached here) plus the
   * `payment` relation when included, minus any `omit`ted fields.
   */
  private orderRead(
    id: string,
    args: { select?: Row; omit?: Row; include?: Row } = {},
  ): Record<string, unknown> | null {
    const row = this.orders.get(id);
    if (!row) return null;
    if (args.select) return project(row, args.select, this.orderRelations);
    const detail: Row = this.orderDetail(id)!;
    const payment = args.include?.payment as { select?: Row } | undefined;
    if (payment) {
      const paymentRow = this.orderRelations.payment(row) as Row | null;
      detail.payment =
        paymentRow && payment.select
          ? project(paymentRow, payment.select)
          : paymentRow;
    }
    return omitKeys(detail, args.omit);
  }

  order = {
    create: ({
      data,
      select,
    }: {
      data: Record<string, unknown> & {
        items?: { create: Record<string, unknown>[] };
      };
      select?: Row;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const { items, ...orderData } = data;
      if (
        typeof orderData.idempotencyKey === 'string' &&
        [...this.orders.values()].some(
          (order) =>
            order.userId === orderData.userId &&
            order.idempotencyKey === orderData.idempotencyKey,
        )
      )
        return Promise.reject(uniqueViolation(['userId', 'idempotencyKey']));
      const row = {
        id: randomUUID(),
        checkoutCartSnapshot: null,
        idempotencyKey: null,
        createdAt: now,
        updatedAt: now,
        ...definedOnly(orderData),
      };
      this.orders.set(row.id as string, row);

      for (const itemData of items?.create ?? []) {
        const itemRow = {
          id: randomUUID(),
          orderId: row.id,
          reservationId: null,
          createdAt: now,
          ...itemData,
        };
        this.orderItems.set(itemRow.id, itemRow);
      }

      return Promise.resolve(this.orderRead(row.id as string, { select })!);
    },
    findUnique: ({
      where,
      ...args
    }: {
      where: { id: string };
      select?: Row;
      omit?: Row;
      include?: Row;
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(this.orderRead(where.id, args)),
    findUniqueOrThrow: async (args: {
      where: { id: string };
      select?: Row;
      omit?: Row;
      include?: Row;
    }): Promise<Record<string, unknown>> => {
      const row = await this.order.findUnique(args);
      if (!row) throw new Error('No Order found');
      return row;
    },
    findFirst: ({
      where,
      ...args
    }: {
      where?: Row;
      select?: Row;
      omit?: Row;
      include?: Row;
    }): Promise<Record<string, unknown> | null> => {
      const row = [...this.orders.values()].find((order) =>
        matchesWhere(order, where),
      );
      return Promise.resolve(
        row ? this.orderRead(row.id as string, args) : null,
      );
    },
    findMany: ({
      where,
      ...args
    }: {
      where?: Row;
      select?: Row;
      omit?: Row;
      include?: Row;
    }): Promise<Record<string, unknown>[]> =>
      Promise.resolve(
        [...this.orders.values()]
          .filter((row) => matchesWhere(row, where))
          .sort(
            (a, b) =>
              (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime(),
          )
          .map((row) => this.orderRead(row.id as string, args)!),
      ),
    update: ({
      where,
      data,
      omit,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
      omit?: Row;
    }): Promise<Record<string, unknown>> => {
      const row = this.orders.get(where.id)!;
      applyData(row, { ...data, updatedAt: new Date() });
      return Promise.resolve(omitKeys({ ...row }, omit));
    },
  };

  sellerOrder = {
    findUniqueOrThrow: async (args: {
      where: { id: string };
    }): Promise<Record<string, unknown>> => {
      const row = await this.sellerOrder.findUnique(args);
      if (!row) throw new Error('Missing sellerOrder');
      return row;
    },

    create: ({
      data,
    }: {
      data: Record<string, unknown> & {
        items?: { create: Record<string, unknown>[] };
      };
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const { items, ...sellerOrderData } = data;
      const row = {
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        ...sellerOrderData,
      };
      this.sellerOrders.set(row.id as string, row);

      for (const itemData of items?.create ?? []) {
        const itemRow = {
          id: randomUUID(),
          sellerOrderId: row.id,
          reservationId: null,
          createdAt: now,
          ...itemData,
        };
        this.orderItems.set(itemRow.id as string, itemRow);
      }

      return Promise.resolve(row);
    },
    updateMany: ({
      where,
      data,
    }: {
      where: { orderId: string };
      data: Record<string, unknown>;
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of this.sellerOrders.values()) {
        if (row.orderId === where.orderId) {
          Object.assign(row, data, { updatedAt: new Date() });
          count += 1;
        }
      }
      return Promise.resolve({ count });
    },
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> => {
      const row = this.sellerOrders.get(where.id);
      if (!row) return Promise.resolve(null);
      const items = [...this.orderItems.values()].filter(
        (item) => item.sellerOrderId === where.id,
      );
      const shippingGroups = [...this.shippingGroups.values()]
        .filter((group) => group.sellerOrderId === where.id)
        .map((group) => ({
          ...group,
          items: [...this.orderItems.values()].filter(
            (item) => item.shippingGroupId === group.id,
          ),
        }));
      return Promise.resolve({ ...row, items, shippingGroups });
    },
    findMany: ({
      where,
    }: {
      where: { sellerId: string };
    }): Promise<Record<string, unknown>[]> =>
      Promise.resolve(
        [...this.sellerOrders.values()]
          .filter((row) => row.sellerId === where.sellerId)
          .map((row) => ({
            ...row,
            items: [...this.orderItems.values()].filter(
              (item) => item.sellerOrderId === row.id,
            ),
            shippingGroups: [...this.shippingGroups.values()]
              .filter((group) => group.sellerOrderId === row.id)
              .map((group) => ({
                ...group,
                items: [...this.orderItems.values()].filter(
                  (item) => item.shippingGroupId === group.id,
                ),
              })),
          })),
      ),
    count: ({ where }: { where: { sellerId: string } }): Promise<number> =>
      Promise.resolve(
        [...this.sellerOrders.values()].filter(
          (row) => row.sellerId === where.sellerId,
        ).length,
      ),
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.sellerOrders.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
  };

  shippingGroup = {
    create: ({
      data,
    }: {
      data: Record<string, unknown> & {
        items?: { create: Record<string, unknown>[] };
      };
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const { items, ...groupData } = data;
      const row = {
        id: randomUUID(),
        createdAt: now,
        ...groupData,
      };
      this.shippingGroups.set(row.id as string, row);
      for (const itemData of items?.create ?? []) {
        const itemRow = {
          id: randomUUID(),
          shippingGroupId: row.id,
          reservationId: null,
          createdAt: now,
          ...itemData,
        };
        this.orderItems.set(itemRow.id as string, itemRow);
      }
      return Promise.resolve({
        ...row,
        items: [...this.orderItems.values()].filter(
          (item) => item.shippingGroupId === row.id,
        ),
      });
    },
  };

  orderItem = {
    findUnique: ({
      where,
    }: {
      where: { id: string };
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(this.orderItems.get(where.id) ?? null),
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.orderItems.get(where.id)!;
      Object.assign(row, data);
      return Promise.resolve(row);
    },
  };

  payment = {
    findUniqueOrThrow: async (args: {
      where: { id?: string; orderId?: string; providerReference?: string };
    }): Promise<Record<string, unknown>> => {
      const row = await this.payment.findUnique(args);
      if (!row) throw new Error('Missing payment');
      return row;
    },

    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      if (
        [...this.payments.values()].some(
          (payment) => payment.orderId === data.orderId,
        )
      )
        return Promise.reject(uniqueViolation(['order_id']));
      const now = new Date();
      const row = {
        id: randomUUID(),
        providerReference: null,
        failureReason: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.payments.set(row.id as string, row);
      return Promise.resolve(row);
    },
    findUnique: ({
      where,
    }: {
      where: { id?: string; orderId?: string; providerReference?: string };
    }): Promise<Record<string, unknown> | null> => {
      if (where.id) return Promise.resolve(this.payments.get(where.id) ?? null);
      const row = [...this.payments.values()].find(
        (payment) =>
          (where.orderId && payment.orderId === where.orderId) ||
          (where.providerReference &&
            payment.providerReference === where.providerReference),
      );
      return Promise.resolve(row ?? null);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.payments.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
  };

  paymentEvent = {
    findUnique: ({
      where,
    }: {
      where: { providerEventId: string };
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(
        [...this.paymentEvents.values()].find(
          (event) => event.providerEventId === where.providerEventId,
        ) ?? null,
      ),
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.paymentEvents.set(row.id as string, row);
      return Promise.resolve(row);
    },
  };

  // --- Checkout attempts (Stage 7) -----------------------------------------
  // The Idempotency-Key receipts. Reads return copies, as Prisma does, so a
  // service comparing a row it read earlier never sees a later write.
  private readonly checkoutAttempts = new Map<
    string,
    Record<string, unknown>
  >();

  private findCheckoutAttemptRow(where: {
    id?: string;
    userId_key?: { userId: string; key: string };
  }): Record<string, unknown> | undefined {
    if (where.id) return this.checkoutAttempts.get(where.id);
    const { userId, key } = where.userId_key!;
    return [...this.checkoutAttempts.values()].find(
      (row) => row.userId === userId && row.key === key,
    );
  }

  checkoutAttempt = {
    findUnique: ({
      where,
      select,
    }: {
      where: { id?: string; userId_key?: { userId: string; key: string } };
      select?: Row;
    }): Promise<Record<string, unknown> | null> => {
      const row = this.findCheckoutAttemptRow(where);
      if (!row) return Promise.resolve(null);
      return Promise.resolve(
        select ? project(row, select) : (cloneData(row) as Row),
      );
    },
    findUniqueOrThrow: async (args: {
      where: { id?: string; userId_key?: { userId: string; key: string } };
      select?: Row;
    }): Promise<Record<string, unknown>> => {
      const row = await this.checkoutAttempt.findUnique(args);
      if (!row) throw new Error('No CheckoutAttempt found');
      return row;
    },
    findMany: ({
      where,
      orderBy,
    }: {
      where?: Row;
      orderBy?: OrderBy;
    } = {}): Promise<Record<string, unknown>[]> =>
      Promise.resolve(
        sortRows(
          [...this.checkoutAttempts.values()].filter((row) =>
            matchesWhere(row, where),
          ),
          orderBy,
        ).map((row) => cloneData(row) as Row),
      ),
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const rows = [...this.checkoutAttempts.values()];
      if (
        rows.some((row) => row.userId === data.userId && row.key === data.key)
      )
        return Promise.reject(uniqueViolation(['user_id', 'key']));
      if (data.orderId && rows.some((row) => row.orderId === data.orderId))
        return Promise.reject(uniqueViolation(['order_id']));
      const now = this.tick();
      const row = {
        id: randomUUID(),
        fingerprintKeyId: null,
        fingerprintVersion: null,
        status: 'IN_PROGRESS',
        stage: 'RECEIVED',
        ownerToken: null,
        leaseExpiresAt: null,
        orderId: null,
        response: null,
        errorStatus: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
        ...definedOnly(data),
      };
      this.checkoutAttempts.set(row.id, row);
      return Promise.resolve(cloneData(row));
    },
    updateMany: ({
      where,
      data,
    }: {
      where?: Row;
      data: Record<string, unknown>;
    }): Promise<{ count: number }> => {
      const matched = [...this.checkoutAttempts.values()].filter((row) =>
        matchesWhere(row, where),
      );
      if (
        typeof data.orderId === 'string' &&
        [...this.checkoutAttempts.values()].some(
          (row) => row.orderId === data.orderId && !matched.includes(row),
        )
      )
        return Promise.reject(uniqueViolation(['order_id']));
      for (const row of matched)
        applyData(row, { ...data, updatedAt: new Date() });
      return Promise.resolve({ count: matched.length });
    },
  };

  // --- Refunds / financials (Phase 1.9) -------------------------------------
  private readonly refunds = new Map<string, Record<string, unknown>>();
  private readonly ledgerEntries = new Map<string, Record<string, unknown>>();
  private readonly sellerBalances = new Map<string, Record<string, unknown>>();
  private readonly payoutRows = new Map<string, Record<string, unknown>>();

  refund = {
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        providerReference: null,
        failureReason: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.refunds.set(row.id as string, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = this.refunds.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    },
  };

  ledgerEntry = {
    findFirst: ({
      where,
    }: {
      where: Record<string, unknown>;
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(
        [...this.ledgerEntries.values()].find((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ) ?? null,
      ),

    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.ledgerEntries.set(row.id as string, row);
      return Promise.resolve(row);
    },
    findMany: ({
      where,
    }: {
      where: { sellerId: string };
    }): Promise<Record<string, unknown>[]> =>
      Promise.resolve(
        [...this.ledgerEntries.values()]
          .filter((row) => row.sellerId === where.sellerId)
          .sort(
            (a, b) =>
              (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime(),
          ),
      ),
    count: ({ where }: { where: { sellerId: string } }): Promise<number> =>
      Promise.resolve(
        [...this.ledgerEntries.values()].filter(
          (row) => row.sellerId === where.sellerId,
        ).length,
      ),
  };

  sellerBalance = {
    findUniqueOrThrow: ({
      where,
    }: {
      where: { sellerId: string };
    }): Promise<Record<string, unknown>> => {
      const row = this.sellerBalances.get(where.sellerId);
      if (!row) return Promise.reject(new Error('Missing balance'));
      return Promise.resolve(row);
    },

    findUnique: ({
      where,
    }: {
      where: { sellerId: string };
    }): Promise<Record<string, unknown> | null> =>
      Promise.resolve(this.sellerBalances.get(where.sellerId) ?? null),
    upsert: ({
      where,
      create,
      update,
    }: {
      where: { sellerId: string };
      create: Record<string, unknown>;
      update: { balance?: { increment: number } };
    }): Promise<Record<string, unknown>> => {
      const existing = this.sellerBalances.get(where.sellerId);
      if (existing) {
        existing.balance =
          (existing.balance as number) + (update.balance?.increment ?? 0);
        existing.updatedAt = new Date();
        return Promise.resolve(existing);
      }
      const row = { ...create, updatedAt: new Date() };
      this.sellerBalances.set(where.sellerId, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { sellerId: string };
      data: { balance: { decrement?: number; increment?: number } };
    }): Promise<Record<string, unknown>> => {
      const row = this.sellerBalances.get(where.sellerId)!;
      row.balance =
        (row.balance as number) -
        (data.balance.decrement ?? 0) +
        (data.balance.increment ?? 0);
      row.updatedAt = new Date();
      return Promise.resolve(row);
    },
  };

  payout = {
    create: ({
      data,
    }: {
      data: Record<string, unknown>;
    }): Promise<Record<string, unknown>> => {
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.payoutRows.set(row.id as string, row);
      return Promise.resolve(row);
    },
    findMany: (): Promise<Record<string, unknown>[]> =>
      Promise.resolve(
        [...this.payoutRows.values()].sort(
          (a, b) =>
            (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime(),
        ),
      ),
    count: (): Promise<number> => Promise.resolve(this.payoutRows.size),
  };

  // No e2e fixture ever seeds a review, so both rating-summary reads always
  // come back empty/null here — the real-Postgres integration suite
  // (test/reviews.integration-spec.ts) is what exercises the populated case.
  productRatingSummary = {
    findMany: (): Promise<Record<string, unknown>[]> => Promise.resolve([]),
  };

  sellerRatingSummary = {
    findUnique: (): Promise<Record<string, unknown> | null> =>
      Promise.resolve(null),
  };

  // FxRatesService.onModuleInit() always hydrates from this on app boot
  // (harmless — it's a DB read, not the live network call, which is
  // separately gated to skip under NODE_ENV=test); no e2e fixture seeds a
  // rate, so the cache stays empty here.
  fxRate = {
    findMany: (): Promise<Record<string, unknown>[]> => Promise.resolve([]),
  };
}
