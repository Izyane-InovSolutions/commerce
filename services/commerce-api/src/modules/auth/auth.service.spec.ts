import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, type User } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { EmailDeliveriesService } from '../../infrastructure/email/email-deliveries.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { hashPassword } from './password.util';
import { hashOpaqueToken } from './token.util';

// 32 bytes once base64-decoded — see field-encryption.util.ts. Not the real
// dev/prod key, just something valid enough to exercise encrypt/decrypt.
const TEST_FIELD_ENCRYPTION_KEY =
  'dGVzdC1vbmx5LWZpZWxkLWVuY3J5cHRpb24ta2V5ISE=';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'hash',
    firstName: null,
    lastName: null,
    phone: null,
    role: Role.CUSTOMER,
    isActive: true,
    emailVerifiedAt: null,
    verificationGraceUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

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

function makeSessionRow(overrides: Partial<FakeSession> = {}): FakeSession {
  const now = new Date();
  return {
    id: 'session-1',
    userId: 'user-1',
    refreshTokenHash: hashOpaqueToken('raw-refresh-token'),
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
    revokedReason: null,
    familyId: 'family-1',
    familyCreatedAt: now,
    ipAddress: null,
    userAgent: null,
    lastUsedAt: now,
    replacedBySessionId: null,
    recoveryData: null,
    recoveryExpiresAt: null,
    createdAt: now,
    ...overrides,
  };
}

// where clauses the real code actually issues against the sessions table —
// enough to make refresh()'s multi-step, transactional logic (claim, reread,
// recover, cascade-revoke) exercisable without a real database.
function matchesWhere(
  row: FakeSession,
  where: Record<string, unknown>,
): boolean {
  if ('id' in where && row.id !== where.id) return false;
  if ('userId' in where && row.userId !== where.userId) return false;
  if ('revokedReason' in where && row.revokedReason !== where.revokedReason)
    return false;
  const alternatives = where.OR as Record<string, unknown>[] | undefined;
  if (
    alternatives &&
    !alternatives.some((alternative) => matchesWhere(row, alternative))
  )
    return false;
  if (
    'revokedAt' in where &&
    where.revokedAt === null &&
    row.revokedAt !== null
  )
    return false;
  const expiresGt = (where.expiresAt as { gt?: Date } | undefined)?.gt;
  if (expiresGt && !(row.expiresAt > expiresGt)) return false;
  const familyNot = (where.familyId as { not?: string } | undefined)?.not;
  if (familyNot && row.familyId === familyNot) return false;
  if (typeof where.familyId === 'string' && row.familyId !== where.familyId)
    return false;
  return true;
}

function createSessionStore(initial: FakeSession[] = []): {
  rows: Map<string, FakeSession>;
  findUnique: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  findMany: jest.Mock;
} {
  const rows = new Map(initial.map((row) => [row.id, { ...row }]));
  let counter = 0;

  return {
    rows,
    findUnique: jest.fn(({ where }: { where: Record<string, unknown> }) => {
      if (where.id) {
        const row = rows.get(where.id as string);
        return Promise.resolve(row ? { ...row } : null);
      }
      if (where.refreshTokenHash) {
        const row = [...rows.values()].find(
          (candidate) => candidate.refreshTokenHash === where.refreshTokenHash,
        );
        return Promise.resolve(row ? { ...row } : null);
      }
      return Promise.resolve(null);
    }),
    create: jest.fn(({ data }: { data: Partial<FakeSession> }) => {
      counter += 1;
      const row = makeSessionRow({
        id: `generated-session-${counter}`,
        ...data,
        revokedAt: null,
        revokedReason: null,
        replacedBySessionId: null,
        recoveryData: null,
        recoveryExpiresAt: null,
      });
      rows.set(row.id, row);
      return Promise.resolve({ ...row });
    }),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeSession>;
      }) => {
        const row = rows.get(where.id);
        if (!row) throw new Error(`session ${where.id} not found`);
        Object.assign(row, data);
        return Promise.resolve({ ...row });
      },
    ),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Partial<FakeSession>;
      }) => {
        let count = 0;
        for (const row of rows.values()) {
          if (!matchesWhere(row, where)) continue;
          Object.assign(row, data);
          count += 1;
        }
        return Promise.resolve({ count });
      },
    ),
    findMany: jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        [...rows.values()].filter((row) => matchesWhere(row, where)),
      ),
    ),
  };
}

describe('AuthService', () => {
  let prisma: {
    session: ReturnType<typeof createSessionStore>;
    passwordResetToken: {
      updateMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
    };
    handoffToken: {
      updateMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
    };
    emailVerificationToken: {
      updateMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
    };
    user: { updateMany: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let usersService: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    updatePasswordHash: jest.Mock;
    normalizeEmail: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };
  let configService: { get: jest.Mock; getOrThrow: jest.Mock };
  let auditService: { record: jest.Mock };
  let emailDeliveries: { enqueue: jest.Mock };
  let authService: AuthService;

  beforeEach(() => {
    prisma = {
      session: createSessionStore(),
      passwordResetToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'reset-1' }),
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      handoffToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      emailVerificationToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'verification-1' }),
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue(undefined),
    };
    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );

    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updatePasswordHash: jest.fn(),
      normalizeEmail: jest.fn((email: string) => email.trim().toLowerCase()),
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key.endsWith('_ENCRYPTION_ACTIVE_KEY_ID')) return 'v1';
        if (key.endsWith('_ENCRYPTION_KEYS')) {
          return JSON.stringify({ v1: TEST_FIELD_ENCRYPTION_KEY });
        }
        return fallback;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'CUSTOMER_WEB_URL') return 'http://localhost:3001';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    emailDeliveries = { enqueue: jest.fn().mockResolvedValue('delivery-1') };

    authService = new AuthService(
      prisma as unknown as PrismaService,
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
      auditService as unknown as AuditService,
      emailDeliveries as unknown as EmailDeliveriesService,
    );
  });

  describe('register', () => {
    it('throws a conflict when the email is already taken', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());

      await expect(
        authService.register('user@example.com', 'password123'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('creates the user and issues tokens', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(buildUser());

      const result = await authService.register(
        'user@example.com',
        'password123',
      );

      expect(usersService.create).toHaveBeenCalledWith(
        'user@example.com',
        expect.any(String),
        prisma,
      );
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'user@example.com',
        role: Role.CUSTOMER,
        emailVerified: false,
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.register',
          actorUserId: 'user-1',
        }) as object,
        prisma,
      );
      expect(emailDeliveries.enqueue).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          template: 'email-verification',
          recipient: 'user@example.com',
          variables: expect.objectContaining({
            verificationTokenId: 'verification-1',
          }) as object,
        }),
      );
    });
  });

  describe('login', () => {
    it('rejects an unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login('nobody@example.com', 'password123'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an inactive user', async () => {
      usersService.findByEmail.mockResolvedValue(
        buildUser({
          isActive: false,
          passwordHash: await hashPassword('password123'),
        }),
      );

      await expect(
        authService.login('user@example.com', 'password123'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an incorrect password', async () => {
      usersService.findByEmail.mockResolvedValue(
        buildUser({ passwordHash: await hashPassword('password123') }),
      );

      await expect(
        authService.login('user@example.com', 'wrong-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.login.failure' }) as object,
      );
    });

    it('issues tokens for correct credentials', async () => {
      const passwordHash = await hashPassword('password123');
      usersService.findByEmail.mockResolvedValue(buildUser({ passwordHash }));
      usersService.findById.mockResolvedValue(buildUser({ passwordHash }));

      const result = await authService.login('user@example.com', 'password123');

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.login.success',
          actorUserId: 'user-1',
        }) as object,
        prisma,
      );
    });

    it('rejects when the password hash changed between the check and the lock', async () => {
      const passwordHash = await hashPassword('password123');
      usersService.findByEmail.mockResolvedValue(buildUser({ passwordHash }));
      // Simulates a concurrent password change winning the race to the lock.
      usersService.findById.mockResolvedValue(
        buildUser({ passwordHash: 'a-different-hash' }),
      );

      await expect(
        authService.login('user@example.com', 'password123'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rejects an unknown refresh token', async () => {
      await expect(authService.refresh('unknown-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an expired refresh token', async () => {
      prisma.session = createSessionStore([
        makeSessionRow({ expiresAt: new Date(Date.now() - 1000) }),
      ]);

      await expect(
        authService.refresh('raw-refresh-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rotates the session and issues a new token pair carrying the family forward', async () => {
      const familyCreatedAt = new Date(Date.now() - 60_000);
      prisma.session = createSessionStore([
        makeSessionRow({ familyId: 'family-A', familyCreatedAt }),
      ]);
      usersService.findById.mockResolvedValue(buildUser());

      const result = await authService.refresh('raw-refresh-token');

      expect(result.accessToken).toBe('signed.jwt.token');

      const rotated = prisma.session.rows.get('session-1')!;
      expect(rotated.revokedAt).not.toBeNull();
      expect(rotated.revokedReason).toBe('rotated');
      expect(rotated.recoveryData).toEqual(expect.any(String));
      expect(rotated.recoveryExpiresAt).not.toBeNull();
      expect(rotated.replacedBySessionId).not.toBeNull();

      const replacement = prisma.session.rows.get(
        rotated.replacedBySessionId!,
      )!;
      expect(replacement.familyId).toBe('family-A');
      expect(replacement.familyCreatedAt).toEqual(familyCreatedAt);
      expect(replacement.revokedAt).toBeNull();
    });

    it('caps a rotated session expiry at 30 days from the family login, never later', async () => {
      const familyCreatedAt = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
      prisma.session = createSessionStore([
        makeSessionRow({ familyId: 'family-A', familyCreatedAt }),
      ]);
      usersService.findById.mockResolvedValue(buildUser());

      const response = await authService.refresh('raw-refresh-token');

      const rotated = prisma.session.rows.get('session-1')!;
      const replacement = prisma.session.rows.get(
        rotated.replacedBySessionId!,
      )!;
      const familyCeiling = new Date(
        familyCreatedAt.getTime() + 30 * 24 * 60 * 60 * 1000,
      );
      expect(replacement.expiresAt.getTime()).toBeLessThanOrEqual(
        familyCeiling.getTime(),
      );
      expect(response.refreshExpiresAt).toBe(
        replacement.expiresAt.toISOString(),
      );
      expect(response.refreshExpiresIn).toBeLessThanOrEqual(24 * 60 * 60);
    });

    it('recovers the same replacement credentials when the rotated token is retried inside the 30s window', async () => {
      prisma.session = createSessionStore([makeSessionRow()]);
      usersService.findById.mockResolvedValue(buildUser());

      const first = await authService.refresh('raw-refresh-token');
      // Same raw token again — its hash now belongs to the just-rotated
      // (revoked) row, not a fresh one.
      const second = await authService.refresh('raw-refresh-token');

      expect(second).toEqual(first);
      // Only one replacement session was ever created, matching the
      // acceptance criterion that concurrent/retried refreshes create one
      // replacement — the FOR UPDATE lock (not exercised by this in-memory
      // fake) is what guarantees this holds under true concurrency too.
      expect(prisma.session.rows.size).toBe(2);
    });

    it('treats a rotated token presented after the recovery window as reuse and revokes every session', async () => {
      const now = Date.now();
      const replacement = makeSessionRow({
        id: 'session-2',
        revokedAt: null,
      });
      const rotated = makeSessionRow({
        id: 'session-1',
        revokedAt: new Date(now - 1000),
        revokedReason: 'rotated',
        replacedBySessionId: 'session-2',
        recoveryData: 'irrelevant',
        recoveryExpiresAt: new Date(now - 500), // window already closed
      });
      prisma.session = createSessionStore([rotated, replacement]);
      usersService.findById.mockResolvedValue(buildUser());

      await expect(
        authService.refresh('raw-refresh-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.session.rows.get('session-2')!.revokedAt).not.toBeNull();
      expect(prisma.session.rows.get('session-2')!.revokedReason).toBe(
        'reuse_detected',
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.session.reuse_detected',
        }) as object,
        prisma,
      );
    });

    it('treats reuse as theft even inside the window once the replacement is itself no longer active', async () => {
      const now = Date.now();
      const replacement = makeSessionRow({
        id: 'session-2',
        revokedAt: new Date(now - 100),
        revokedReason: 'logout',
      });
      const rotated = makeSessionRow({
        id: 'session-1',
        revokedAt: new Date(now - 1000),
        revokedReason: 'rotated',
        replacedBySessionId: 'session-2',
        recoveryData: 'irrelevant',
        recoveryExpiresAt: new Date(now + 20_000), // still inside the window
      });
      prisma.session = createSessionStore([rotated, replacement]);
      usersService.findById.mockResolvedValue(buildUser());

      await expect(
        authService.refresh('raw-refresh-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.session.reuse_detected',
        }) as object,
        prisma,
      );
    });

    it('does not treat a logout-revoked token as reuse', async () => {
      prisma.session = createSessionStore([
        makeSessionRow({ revokedAt: new Date(), revokedReason: 'logout' }),
      ]);

      await expect(
        authService.refresh('raw-refresh-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(auditService.record).not.toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.session.reuse_detected',
        }) as object,
      );
    });

    it('does not treat a password-change-revoked token as reuse', async () => {
      prisma.session = createSessionStore([
        makeSessionRow({
          revokedAt: new Date(),
          revokedReason: 'password_change',
        }),
      ]);

      await expect(
        authService.refresh('raw-refresh-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(auditService.record).not.toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.session.reuse_detected',
        }) as object,
      );
    });

    it('rejects when the owning user has been deactivated', async () => {
      prisma.session = createSessionStore([makeSessionRow()]);
      usersService.findById.mockResolvedValue(buildUser({ isActive: false }));

      await expect(
        authService.refresh('raw-refresh-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('throws not found when the session does not belong to the user', async () => {
      prisma.session = createSessionStore([
        makeSessionRow({ id: 's1', userId: 'someone-else' }),
      ]);

      await expect(
        authService.logout('user-1', 'raw-refresh-token'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('revokes the matching session with reason "logout"', async () => {
      prisma.session = createSessionStore([makeSessionRow({ id: 's1' })]);

      await authService.logout('user-1', 'raw-refresh-token');

      const row = prisma.session.rows.get('s1')!;
      expect(row.revokedAt).not.toBeNull();
      expect(row.revokedReason).toBe('logout');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.logout' }) as object,
        prisma,
      );
    });
  });

  describe('changePassword', () => {
    it('rejects an incorrect current password', async () => {
      usersService.findById.mockResolvedValue(
        buildUser({ passwordHash: await hashPassword('correct-password') }),
      );

      await expect(
        authService.changePassword(
          'user-1',
          'session-1',
          'wrong-password',
          'new-password',
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('updates the password and revokes every other session family, keeping the current one', async () => {
      const passwordHash = await hashPassword('correct-password');
      usersService.findById.mockResolvedValue(buildUser({ passwordHash }));
      prisma.session = createSessionStore([
        makeSessionRow({ id: 'session-1', familyId: 'family-A' }),
        makeSessionRow({ id: 'session-2', familyId: 'family-B' }),
      ]);

      await authService.changePassword(
        'user-1',
        'session-1',
        'correct-password',
        'new-password',
      );

      expect(usersService.updatePasswordHash).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
        prisma,
      );
      expect(prisma.session.rows.get('session-1')!.revokedAt).toBeNull();
      const other = prisma.session.rows.get('session-2')!;
      expect(other.revokedAt).not.toBeNull();
      expect(other.revokedReason).toBe('password_change');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.password.changed' }) as object,
        prisma,
      );
    });
  });

  describe('requestPasswordReset', () => {
    it('creates a reset token for a known email', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());

      await authService.requestPasswordReset('user@example.com');

      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1' }) as object,
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.password_reset.requested',
        }) as object,
        prisma,
      );
      expect(emailDeliveries.enqueue).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          template: 'password-reset',
          recipient: 'user@example.com',
          variables: expect.objectContaining({
            resetTokenId: 'reset-1',
          }) as object,
        }),
      );
    });

    it('does not create another token during the per-account cooldown', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());
      prisma.passwordResetToken.findFirst.mockResolvedValue({ id: 'recent' });

      await authService.requestPasswordReset('user@example.com');

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailDeliveries.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('confirmPasswordReset', () => {
    it('rejects an unknown token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        authService.confirmPasswordReset('bad-token', 'new-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an already-used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        userId: 'user-1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
      });

      await expect(
        authService.confirmPasswordReset('used-token', 'new-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        authService.confirmPasswordReset('expired-token', 'new-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a reset token consumed by a concurrent request', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60000),
      });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        authService.confirmPasswordReset('valid-token', 'new-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersService.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('updates the password, invalidates outstanding tokens, revokes sessions, and queues a notification', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 1000),
      });
      usersService.findById.mockResolvedValue(buildUser());
      prisma.session = createSessionStore([
        makeSessionRow({
          id: 'session-1',
          recoveryData: 'stale-recovery-data',
          recoveryExpiresAt: new Date(Date.now() + 20_000),
        }),
      ]);

      await authService.confirmPasswordReset('valid-token', 'new-password');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', usedAt: null },
        data: { usedAt: expect.any(Date) as Date },
      });
      expect(prisma.handoffToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', usedAt: null },
        data: { usedAt: expect.any(Date) as Date },
      });
      const row = prisma.session.rows.get('session-1')!;
      expect(row.revokedAt).not.toBeNull();
      expect(row.revokedReason).toBe('password_reset');
      expect(row.recoveryData).toBeNull();
      expect(row.recoveryExpiresAt).toBeNull();
      expect(emailDeliveries.enqueue).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          template: 'password-changed',
          recipient: 'user@example.com',
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.password_reset.confirmed',
        }) as object,
        prisma,
      );
    });
  });

  describe('email verification', () => {
    it('queues a new email-bound token when an unverified user resends', async () => {
      usersService.findById.mockResolvedValue(buildUser());

      await authService.resendEmailVerification('user-1');

      expect(prisma.emailVerificationToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          targetEmail: 'user@example.com',
        }) as object,
      });
      expect(emailDeliveries.enqueue).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ template: 'email-verification' }),
      );
    });

    it('does not resend during the per-account cooldown', async () => {
      usersService.findById.mockResolvedValue(buildUser());
      prisma.emailVerificationToken.findFirst.mockResolvedValue({
        id: 'recent',
      });

      await authService.resendEmailVerification('user-1');

      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
      expect(emailDeliveries.enqueue).not.toHaveBeenCalled();
    });

    it('rejects a token when the account email has changed', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'verification-1',
        userId: 'user-1',
        targetEmail: 'old@example.com',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      usersService.findById.mockResolvedValue(
        buildUser({ email: 'new@example.com' }),
      );

      await expect(
        authService.confirmEmailVerification('raw-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('atomically claims the token and verifies only its current email', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'verification-1',
        userId: 'user-1',
        targetEmail: 'user@example.com',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      usersService.findById.mockResolvedValue(buildUser());

      await authService.confirmEmailVerification('raw-token');

      expect(prisma.emailVerificationToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'verification-1',
            targetEmail: 'user@example.com',
            usedAt: null,
          }) as object,
        }),
      );
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', email: 'user@example.com' },
        data: {
          emailVerifiedAt: expect.any(Date) as Date,
          verificationGraceUntil: null,
        },
      });
    });

    it('rejects a token already claimed by a concurrent confirmation', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'verification-1',
        userId: 'user-1',
        targetEmail: 'user@example.com',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      usersService.findById.mockResolvedValue(buildUser());
      prisma.emailVerificationToken.updateMany.mockResolvedValueOnce({
        count: 0,
      });

      await expect(
        authService.confirmEmailVerification('raw-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('mintHandoffToken', () => {
    it('creates a handoff token and returns a code with its ttl', async () => {
      const result = await authService.mintHandoffToken('user-1');

      expect(prisma.handoffToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1' }) as object,
        }),
      );
      expect(result.code).toEqual(expect.any(String));
      expect(result.expiresIn).toBe(60);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.handoff.issued' }) as object,
        prisma,
      );
    });
  });

  describe('exchangeHandoffToken', () => {
    it('rejects an unknown code', async () => {
      prisma.handoffToken.findUnique.mockResolvedValue(null);

      await expect(
        authService.exchangeHandoffToken('bad-code'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an already-used code', async () => {
      prisma.handoffToken.findUnique.mockResolvedValue({
        id: 'handoff-1',
        userId: 'user-1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
      });

      await expect(
        authService.exchangeHandoffToken('used-code'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an expired code', async () => {
      prisma.handoffToken.findUnique.mockResolvedValue({
        id: 'handoff-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        authService.exchangeHandoffToken('expired-code'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a code consumed by a concurrent request', async () => {
      prisma.handoffToken.findUnique.mockResolvedValue({
        id: 'handoff-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60000),
      });
      prisma.handoffToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        authService.exchangeHandoffToken('valid-code'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('rejects a code for a since-deactivated user', async () => {
      prisma.handoffToken.findUnique.mockResolvedValue({
        id: 'handoff-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60000),
      });
      usersService.findById.mockResolvedValue(buildUser({ isActive: false }));

      await expect(
        authService.exchangeHandoffToken('valid-code'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('claims the code and issues a token pair for the owning user', async () => {
      prisma.handoffToken.findUnique.mockResolvedValue({
        id: 'handoff-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60000),
      });
      usersService.findById.mockResolvedValue(buildUser());

      const result = await authService.exchangeHandoffToken('valid-code');

      expect(prisma.handoffToken.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'handoff-1',
          usedAt: null,
          expiresAt: { gt: expect.any(Date) as Date },
        },
        data: { usedAt: expect.any(Date) as Date },
      });
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.handoff.exchanged' }) as object,
        prisma,
      );
    });
  });

  describe('sessions', () => {
    it('exposes metadata without token hashes or recovery credentials and identifies the current family', async () => {
      const previous = makeSessionRow({
        id: 'previous',
        revokedAt: new Date(),
        revokedReason: 'rotated',
      });
      const active = makeSessionRow({
        id: 'active',
        ipAddress: '192.0.2.1',
        userAgent: 'Test browser',
        recoveryData: 'secret',
      });
      prisma.session = createSessionStore([previous, active]);
      const sessions = await authService.listSessions('user-1', 'previous');
      expect(sessions).toEqual([
        {
          id: active.id,
          createdAt: active.createdAt,
          expiresAt: active.expiresAt,
          signedInAt: active.familyCreatedAt,
          lastUsedAt: active.lastUsedAt,
          ipAddress: '192.0.2.1',
          userAgent: 'Test browser',
          isCurrent: true,
        },
      ]);
    });

    it('lists only the caller-owned active sessions', async () => {
      prisma.session = createSessionStore([
        makeSessionRow({ id: 's1', userId: 'user-1' }),
        makeSessionRow({ id: 's2', userId: 'someone-else' }),
      ]);

      const sessions = await authService.listSessions('user-1');

      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.id).toBe('s1');
    });

    it('throws not found when revoking a session owned by someone else', async () => {
      prisma.session = createSessionStore([
        makeSessionRow({ id: 's1', userId: 'someone-else' }),
      ]);

      await expect(
        authService.revokeSession('user-1', 's1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('revokes a caller-owned session with reason "session_revoked"', async () => {
      prisma.session = createSessionStore([
        makeSessionRow({ id: 's1', userId: 'user-1' }),
      ]);

      await authService.revokeSession('user-1', 's1');

      const row = prisma.session.rows.get('s1')!;
      expect(row.revokedAt).not.toBeNull();
      expect(row.revokedReason).toBe('session_revoked');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.session.revoked' }) as object,
        prisma,
      );
    });

    it('revokes the replacement when the listed session already rotated, leaving other families intact', async () => {
      prisma.session = createSessionStore([
        makeSessionRow({
          id: 'old',
          revokedAt: new Date(),
          revokedReason: 'rotated',
        }),
        makeSessionRow({ id: 'replacement' }),
        makeSessionRow({ id: 'other', familyId: 'family-2' }),
      ]);
      await authService.revokeSession('user-1', 'old');
      expect(prisma.session.rows.get('replacement')?.revokedReason).toBe(
        'session_revoked',
      );
      expect(prisma.session.rows.get('other')?.revokedAt).toBeNull();
      await authService.revokeSession('user-1', 'old');
      expect(auditService.record).toHaveBeenCalledTimes(1);
    });

    it('revokes other families while preserving a rotated current family and other users', async () => {
      prisma.session = createSessionStore([
        makeSessionRow({
          id: 'old',
          revokedAt: new Date(),
          revokedReason: 'rotated',
        }),
        makeSessionRow({ id: 'current' }),
        makeSessionRow({ id: 'other', familyId: 'family-2' }),
        makeSessionRow({
          id: 'foreign',
          userId: 'someone-else',
          familyId: 'family-3',
        }),
      ]);
      await authService.revokeOtherSessions('user-1', 'old');
      expect(prisma.session.rows.get('current')?.revokedAt).toBeNull();
      expect(prisma.session.rows.get('other')?.revokedReason).toBe(
        'session_revoked',
      );
      expect(prisma.session.rows.get('foreign')?.revokedAt).toBeNull();
      await authService.revokeOtherSessions('user-1', 'current');
      expect(auditService.record).toHaveBeenCalledTimes(1);
    });

    it('rejects revoke-others for a foreign or no-longer-active current session', async () => {
      prisma.session = createSessionStore([
        makeSessionRow({ id: 'foreign', userId: 'someone-else' }),
        makeSessionRow({
          id: 'revoked',
          revokedAt: new Date(),
          revokedReason: 'logout',
        }),
      ]);
      for (const id of ['foreign', 'revoked', 'missing']) {
        await expect(
          authService.revokeOtherSessions('user-1', id),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      }
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });
  });
});
