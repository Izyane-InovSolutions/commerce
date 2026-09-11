import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, type User } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { hashPassword } from './password.util';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'hash',
    role: Role.CUSTOMER,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let prisma: {
    session: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
    };
    passwordResetToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    user: { update: jest.Mock };
    $transaction: jest.Mock;
  };
  let usersService: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    updatePasswordHash: jest.Mock;
    normalizeEmail: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };
  let configService: { get: jest.Mock };
  let auditService: { record: jest.Mock };
  let authService: AuthService;

  beforeEach(() => {
    prisma = {
      session: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      passwordResetToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: { update: jest.fn() },
      $transaction: jest.fn(),
    };
    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updatePasswordHash: jest.fn(),
      normalizeEmail: jest.fn((email: string) => email.trim().toLowerCase()),
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    configService = {
      get: jest.fn((_key: string, fallback?: number) => fallback),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };

    prisma.session.create.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'hash',
      expiresAt: new Date(Date.now() + 1000),
      revokedAt: null,
      createdAt: new Date(),
    });

    authService = new AuthService(
      prisma as unknown as PrismaService,
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
      auditService as unknown as AuditService,
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
      );
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'user@example.com',
        role: Role.CUSTOMER,
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.register',
          actorUserId: 'user-1',
        }) as object,
      );
    });
  });

  describe('login', () => {
    it('rejects an unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login('nobody@example.com', 'password123'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
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
      usersService.findByEmail.mockResolvedValue(
        buildUser({ passwordHash: await hashPassword('password123') }),
      );

      const result = await authService.login('user@example.com', 'password123');

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.login.success',
          actorUserId: 'user-1',
        }) as object,
      );
    });
  });

  describe('refresh', () => {
    it('rejects an unknown refresh token', async () => {
      prisma.session.findUnique.mockResolvedValue(null);

      await expect(authService.refresh('unknown-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('revokes all sessions and rejects when a revoked token is reused', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
      });

      await expect(authService.refresh('reused-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1' }) as object,
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.session.reuse_detected',
        }) as object,
      );
    });

    it('rejects an expired refresh token', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(authService.refresh('expired-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rotates the session and issues a new token pair', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'old-session',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000),
      });
      usersService.findById.mockResolvedValue(buildUser());

      const result = await authService.refresh('valid-token');

      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 'old-session' },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(result.accessToken).toBe('signed.jwt.token');
    });
  });

  describe('logout', () => {
    it('throws not found when the session does not belong to the user', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'someone-else',
        revokedAt: null,
      });

      await expect(
        authService.logout('user-1', 'token'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('revokes the matching session', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'user-1',
        revokedAt: null,
      });

      await authService.logout('user-1', 'token');

      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.logout' }) as object,
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
    });

    it('updates the password and revokes every other session', async () => {
      usersService.findById.mockResolvedValue(
        buildUser({ passwordHash: await hashPassword('correct-password') }),
      );

      await authService.changePassword(
        'user-1',
        'session-1',
        'correct-password',
        'new-password',
      );

      expect(usersService.updatePasswordHash).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
      );
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null, id: { not: 'session-1' } },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.password.changed' }) as object,
      );
    });
  });

  describe('requestPasswordReset', () => {
    it('does nothing for an unknown email, without leaking existence', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await authService.requestPasswordReset('nobody@example.com');

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

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
      );
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

    it('updates the password, marks the token used, and revokes all sessions', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'reset-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 1000),
      });
      prisma.$transaction.mockResolvedValue(undefined);

      await authService.confirmPasswordReset('valid-token', 'new-password');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.password_reset.confirmed',
        }) as object,
      );
    });
  });

  describe('sessions', () => {
    it('lists only the caller-owned active sessions', async () => {
      prisma.session.findMany.mockResolvedValue([
        { id: 's1', createdAt: new Date(), expiresAt: new Date() },
      ]);

      const sessions = await authService.listSessions('user-1');

      expect(prisma.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1' }) as object,
        }),
      );
      expect(sessions).toHaveLength(1);
    });

    it('throws not found when revoking a session owned by someone else', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'someone-else',
        revokedAt: null,
      });

      await expect(
        authService.revokeSession('user-1', 's1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('revokes a caller-owned session', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 's1',
        userId: 'user-1',
        revokedAt: null,
      });

      await authService.revokeSession('user-1', 's1');

      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.session.revoked' }) as object,
      );
    });
  });
});
