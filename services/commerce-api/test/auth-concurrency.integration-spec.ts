import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { hashPassword } from '../src/modules/auth/password.util';
import { hashOpaqueToken } from '../src/modules/auth/token.util';
import { UsersService } from '../src/modules/users/users.service';

jest.setTimeout(20_000);

describe('Authentication concurrency (integration, real Postgres)', () => {
  let prisma: PrismaService;
  let auth: AuthService;
  let users: UsersService;
  let audit: AuditService;
  let config: ConfigService;
  let moduleRef: TestingModule;
  const userIds: string[] = [];
  const emails: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    auth = moduleRef.get(AuthService);
    users = moduleRef.get(UsersService);
    audit = moduleRef.get(AuditService);
    config = moduleRef.get(ConfigService);
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({
      where: { actorUserId: { in: userIds } },
    });
    await prisma.emailDelivery.deleteMany({
      where: { recipient: { in: emails } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await moduleRef.close();
  });

  async function createUser(): Promise<{
    id: string;
    email: string;
    password: string;
  }> {
    const password = 'old-password-123';
    const email = `auth-concurrency-${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password) },
    });
    userIds.push(user.id);
    emails.push(email);
    return { id: user.id, email, password };
  }

  async function createResetToken(userId: string): Promise<string> {
    const rawToken = `reset-${randomUUID()}-${randomUUID()}`;
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashOpaqueToken(rawToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    return rawToken;
  }

  async function createVerificationToken(
    userId: string,
    email: string,
  ): Promise<string> {
    const rawToken = `verify-${randomUUID()}-${randomUUID()}`;
    await prisma.emailVerificationToken.create({
      data: {
        userId,
        targetEmail: email,
        tokenHash: hashOpaqueToken(rawToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    return rawToken;
  }

  it('creates one replacement and returns it to concurrent refresh callers', async () => {
    const user = await createUser();
    const login = await auth.login(user.email, user.password);

    const [first, second] = await Promise.all([
      auth.refresh(login.refreshToken),
      auth.refresh(login.refreshToken),
    ]);

    expect(second).toEqual(first);
    const sessions = await prisma.session.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(sessions).toHaveLength(2);
    expect(
      sessions.filter((session) => session.revokedAt === null),
    ).toHaveLength(1);
    expect(sessions[0]?.replacedBySessionId).toBe(sessions[1]?.id);
  });

  it('allows exactly one concurrent verification claim for the current email', async () => {
    const user = await createUser();
    const token = await createVerificationToken(user.id, user.email);

    const results = await Promise.allSettled([
      auth.confirmEmailVerification(token),
      auth.confirmEmailVerification(token),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const verified = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(verified.emailVerifiedAt).not.toBeNull();
    expect(
      await prisma.emailVerificationToken.count({
        where: { userId: user.id, usedAt: null },
      }),
    ).toBe(0);
  });

  it('leaves no old-password login session active after a concurrent reset', async () => {
    const user = await createUser();
    const resetToken = await createResetToken(user.id);

    await Promise.allSettled([
      auth.login(user.email, user.password),
      auth.confirmPasswordReset(resetToken, 'new-password-123'),
    ]);

    expect(
      await prisma.session.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0);
    await expect(auth.login(user.email, user.password)).rejects.toThrow();
    await expect(
      auth.login(user.email, 'new-password-123'),
    ).resolves.toBeDefined();
  });

  it('leaves no refresh-created session active after a concurrent reset', async () => {
    const user = await createUser();
    const login = await auth.login(user.email, user.password);
    const resetToken = await createResetToken(user.id);

    await Promise.allSettled([
      auth.refresh(login.refreshToken),
      auth.confirmPasswordReset(resetToken, 'new-password-123'),
    ]);

    expect(
      await prisma.session.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0);
  });

  it('leaves no handoff-created session active after a concurrent reset', async () => {
    const user = await createUser();
    const handoff = await auth.mintHandoffToken(user.id);
    const resetToken = await createResetToken(user.id);

    await Promise.allSettled([
      auth.exchangeHandoffToken(handoff.code),
      auth.confirmPasswordReset(resetToken, 'new-password-123'),
    ]);

    expect(
      await prisma.session.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0);
    const stored = await prisma.handoffToken.findUnique({
      where: { tokenHash: hashOpaqueToken(handoff.code) },
    });
    expect(stored?.usedAt).not.toBeNull();
  });

  it('rolls refresh rotation back when replacement token issuance fails', async () => {
    const user = await createUser();
    const login = await auth.login(user.email, user.password);
    const failingJwt = {
      signAsync: jest.fn().mockRejectedValue(new Error('signing unavailable')),
    } as unknown as JwtService;
    const failingAuth = new AuthService(
      prisma,
      users,
      failingJwt,
      config,
      audit,
    );

    await expect(failingAuth.refresh(login.refreshToken)).rejects.toThrow(
      'signing unavailable',
    );

    const original = await prisma.session.findUnique({
      where: { refreshTokenHash: hashOpaqueToken(login.refreshToken) },
    });
    expect(original?.revokedAt).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });
});
