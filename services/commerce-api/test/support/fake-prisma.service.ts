import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';

type FakeUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type FakeSession = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
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

/**
 * A minimal in-memory stand-in for PrismaClient covering only the operations
 * AuthService uses, so auth e2e flows can run without a real database.
 */
export class FakePrismaService {
  private readonly users = new Map<string, FakeUser>();
  private readonly sessions = new Map<string, FakeSession>();
  private readonly passwordResetTokens = new Map<
    string,
    FakePasswordResetToken
  >();

  $connect(): Promise<void> {
    return Promise.resolve();
  }

  $disconnect(): Promise<void> {
    return Promise.resolve();
  }

  $transaction<T extends unknown[]>(operations: T): Promise<T> {
    return Promise.all(operations) as Promise<T>;
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
        role: Role.CUSTOMER,
        isActive: true,
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
  };

  session = {
    create: ({
      data,
    }: {
      data: { userId: string; refreshTokenHash: string; expiresAt: Date };
    }): Promise<FakeSession> => {
      const session: FakeSession = {
        id: randomUUID(),
        userId: data.userId,
        refreshTokenHash: data.refreshTokenHash,
        expiresAt: data.expiresAt,
        revokedAt: null,
        createdAt: new Date(),
      };
      this.sessions.set(session.id, session);
      return Promise.resolve(session);
    },
    findUnique: ({
      where,
    }: {
      where: { id?: string; refreshTokenHash?: string };
    }): Promise<FakeSession | null> => {
      if (where.id) {
        return Promise.resolve(this.sessions.get(where.id) ?? null);
      }

      return Promise.resolve(
        [...this.sessions.values()].find(
          (session) => session.refreshTokenHash === where.refreshTokenHash,
        ) ?? null,
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
      where: { userId: string; revokedAt: null; id?: { not: string } };
      data: Partial<FakeSession>;
    }): Promise<{ count: number }> => {
      let count = 0;

      for (const session of this.sessions.values()) {
        if (session.userId !== where.userId || session.revokedAt !== null) {
          continue;
        }

        if (where.id && session.id === where.id.not) {
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
      where: { userId: string };
    }): Promise<FakeSession[]> => {
      return Promise.resolve(
        [...this.sessions.values()].filter(
          (session) =>
            session.userId === where.userId &&
            session.revokedAt === null &&
            session.expiresAt > new Date(),
        ),
      );
    },
  };

  passwordResetToken = {
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
}
