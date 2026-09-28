import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Interval } from '@nestjs/schedule';
import type { Prisma, Session, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import {
  decryptField,
  encryptField,
  type FieldEncryptionKeyring,
} from '../../common/crypto/field-encryption.util';
import { PrismaService } from '../../database/prisma.service';
import { EmailDeliveriesService } from '../../infrastructure/email/email-deliveries.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import {
  AuthTokensResponse,
  HandoffCodeResponse,
  PublicUser,
  SessionSummary,
} from './auth-response';
import { comparePassword, hashPassword } from './password.util';
import { generateOpaqueToken, hashOpaqueToken } from './token.util';

const PASSWORD_RESET_TOKEN_TTL_SECONDS = 60 * 60;
const PASSWORD_RESET_REQUEST_COOLDOWN_MS = 60 * 1000;
const EMAIL_VERIFICATION_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
const HANDOFF_TOKEN_TTL_SECONDS = 60;
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

// A session family's absolute lifetime, anchored at the login that started
// it. Every rotation within the family carries familyCreatedAt forward
// unchanged, so this ceiling can shrink a rotation's expiry but never push
// it further out.
const FAMILY_MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

// How long a just-rotated session's replacement credentials stay recoverable
// by presenting the same (now-revoked) refresh token again — e.g. a client
// retrying after a dropped response. Presenting it after this window (or
// once the replacement is itself no longer active) is treated as reuse.
const REFRESH_RECOVERY_WINDOW_MS = 30 * 1000;

const RevocationReason = {
  Logout: 'logout',
  PasswordChange: 'password_change',
  PasswordReset: 'password_reset',
  SessionRevoked: 'session_revoked',
  Rotated: 'rotated',
  ReuseDetected: 'reuse_detected',
} as const;

type RefreshOutcome =
  | { ok: true; response: AuthTokensResponse }
  | { ok: false; message: string };

export type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly emailDeliveries: EmailDeliveriesService,
  ) {}

  async register(
    email: string,
    password: string,
    context: RequestContext = {},
  ): Promise<AuthTokensResponse> {
    const existing = await this.usersService.findByEmail(email);

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await hashPassword(password);
    return this.prisma.$transaction(async (tx) => {
      const user = await this.usersService.create(email, passwordHash, tx);
      await this.createEmailVerification(user, tx, false);
      await this.auditService.record(
        {
          actorUserId: user.id,
          action: 'auth.register',
          targetType: 'User',
          targetId: user.id,
          ...context,
        },
        tx,
      );
      const { response } = await this.issueTokens(user, tx, undefined, context);
      return response;
    });
  }

  async login(
    email: string,
    password: string,
    context: RequestContext = {},
  ): Promise<AuthTokensResponse> {
    const user = await this.usersService.findByEmail(email);
    const isValid =
      !!user &&
      user.isActive &&
      (await comparePassword(password, user.passwordHash));

    if (!isValid) {
      await this.auditService.record({
        actorUserId: user?.id,
        action: 'auth.login.failure',
        targetType: 'User',
        targetId: user?.id,
        metadata: { email: this.usersService.normalizeEmail(email) },
        ...context,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    return this.withUserLock(user.id, async (tx) => {
      // Reread under the lock: a concurrent password change between the
      // check above and acquiring this lock must not let a now-stale
      // password hash go on to mint tokens.
      const locked = await this.usersService.findById(user.id, tx);

      if (
        !locked ||
        !locked.isActive ||
        locked.passwordHash !== user.passwordHash
      ) {
        throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
      }

      await this.auditService.record(
        {
          actorUserId: locked.id,
          action: 'auth.login.success',
          targetType: 'User',
          targetId: locked.id,
          ...context,
        },
        tx,
      );

      const { response } = await this.issueTokens(
        locked,
        tx,
        undefined,
        context,
      );
      return response;
    });
  }

  async refresh(
    rawRefreshToken: string,
    context: RequestContext = {},
  ): Promise<AuthTokensResponse> {
    const tokenHash = hashOpaqueToken(rawRefreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Every branch below returns an outcome instead of throwing, so a
    // reuse-detection revocation (which writes to the database) always
    // commits with the rest of the transaction — the error is only thrown
    // once the transaction has resolved, never from inside it.
    const outcome = await this.withUserLock<RefreshOutcome>(
      session.userId,
      async (tx) => {
        const now = new Date();
        const current = await tx.session.findUnique({
          where: { id: session.id },
        });

        if (!current) {
          return { ok: false, message: 'Invalid refresh token' };
        }

        const claim = await tx.session.updateMany({
          where: { id: current.id, revokedAt: null, expiresAt: { gt: now } },
          data: { revokedAt: now, revokedReason: RevocationReason.Rotated },
        });

        if (claim.count === 1) {
          const user = await this.usersService.findById(current.userId, tx);

          if (!user || !user.isActive) {
            return { ok: false, message: 'Invalid refresh token' };
          }

          const { response, session: replacement } = await this.issueTokens(
            user,
            tx,
            {
              familyId: current.familyId,
              familyCreatedAt: current.familyCreatedAt,
            },
            context,
          );

          await tx.session.update({
            where: { id: current.id },
            data: {
              replacedBySessionId: replacement.id,
              recoveryData: encryptField(
                JSON.stringify(response),
                this.encryptionKeyring('REFRESH_RECOVERY'),
                `refresh-recovery:${current.id}`,
              ),
              recoveryExpiresAt: new Date(
                now.getTime() + REFRESH_RECOVERY_WINDOW_MS,
              ),
            },
          });

          return { ok: true, response };
        }

        // The claim failed: `current` was already revoked, or has expired,
        // by the time we reread it under the lock.
        if (!current.revokedAt) {
          if (current.expiresAt < now) {
            return { ok: false, message: 'Refresh token has expired' };
          }
          // Unreachable in practice — the user lock serializes every
          // mutator of this row — but fail closed on an unrecognized state
          // rather than proceed.
          return { ok: false, message: 'Invalid refresh token' };
        }

        if (
          current.recoveryData &&
          current.recoveryExpiresAt &&
          current.recoveryExpiresAt > now &&
          current.replacedBySessionId
        ) {
          const replacement = await tx.session.findUnique({
            where: { id: current.replacedBySessionId },
          });
          const replacementUser = replacement
            ? await this.usersService.findById(replacement.userId, tx)
            : null;

          if (
            replacement &&
            !replacement.revokedAt &&
            replacement.expiresAt > now &&
            replacementUser?.isActive
          ) {
            return {
              ok: true,
              response: JSON.parse(
                decryptField(
                  current.recoveryData,
                  this.encryptionKeyring('REFRESH_RECOVERY'),
                  `refresh-recovery:${current.id}`,
                ),
              ) as AuthTokensResponse,
            };
          }
        }

        if (current.revokedReason !== RevocationReason.Rotated) {
          // Revoked by logout, password change, or explicit session
          // management — a stale token being presented again, not theft.
          return {
            ok: false,
            message: 'Session has been revoked or expired',
          };
        }

        this.logger.warn(
          `Refresh token reuse detected for user ${current.userId}; revoking all sessions`,
        );
        await this.revokeAllSessionsForUser(
          current.userId,
          tx,
          RevocationReason.ReuseDetected,
        );
        await this.auditService.record(
          {
            actorUserId: current.userId,
            action: 'auth.session.reuse_detected',
            targetType: 'Session',
            targetId: current.id,
            ...context,
          },
          tx,
        );

        return { ok: false, message: 'Refresh token has already been used' };
      },
    );

    if (!outcome.ok) {
      throw new UnauthorizedException(outcome.message);
    }

    return outcome.response;
  }

  async logout(
    userId: string,
    rawRefreshToken: string,
    context: RequestContext = {},
  ): Promise<void> {
    const tokenHash = hashOpaqueToken(rawRefreshToken);

    await this.withUserLock(userId, async (tx) => {
      const session = await tx.session.findUnique({
        where: { refreshTokenHash: tokenHash },
      });

      if (!session || session.userId !== userId) {
        throw new NotFoundException('Session not found');
      }

      if (!session.revokedAt) {
        await tx.session.update({
          where: { id: session.id },
          data: {
            revokedAt: new Date(),
            revokedReason: RevocationReason.Logout,
          },
        });
        await this.auditService.record(
          {
            actorUserId: userId,
            action: 'auth.logout',
            targetType: 'Session',
            targetId: session.id,
            ...context,
          },
          tx,
        );
      }
    });
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toPublicUser(user);
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
    context: RequestContext = {},
  ): Promise<void> {
    const user = await this.usersService.findById(userId);

    if (!user || !(await comparePassword(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await hashPassword(newPassword);

    await this.withUserLock(userId, async (tx) => {
      const locked = await this.usersService.findById(userId, tx);

      if (!locked || locked.passwordHash !== user.passwordHash) {
        throw new UnauthorizedException('Current password is incorrect');
      }

      await this.usersService.updatePasswordHash(userId, passwordHash, tx);

      const currentSession = await tx.session.findUnique({
        where: { id: currentSessionId },
      });
      await this.revokeAllSessionsForUser(
        userId,
        tx,
        RevocationReason.PasswordChange,
        currentSession?.familyId,
      );

      await this.auditService.record(
        {
          actorUserId: userId,
          action: 'auth.password.changed',
          targetType: 'User',
          targetId: userId,
          ...context,
        },
        tx,
      );
    });
  }

  async requestPasswordReset(
    email: string,
    context: RequestContext = {},
  ): Promise<void> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      return;
    }

    const rawToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_TOKEN_TTL_SECONDS * 1000,
    );

    await this.withUserLock(user.id, async (tx) => {
      const recent = await tx.passwordResetToken.findFirst({
        where: {
          userId: user.id,
          createdAt: {
            gt: new Date(Date.now() - PASSWORD_RESET_REQUEST_COOLDOWN_MS),
          },
        },
        select: { id: true },
      });
      if (recent) {
        return;
      }

      const resetToken = await tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
      const resetUrl = new URL(
        '/reset-password',
        this.configService.getOrThrow<string>('CUSTOMER_WEB_URL'),
      );
      resetUrl.searchParams.set('token', rawToken);
      await this.emailDeliveries.enqueue(tx, {
        template: 'password-reset',
        recipient: user.email,
        variables: {
          resetUrl: resetUrl.toString(),
          resetTokenId: resetToken.id,
        },
        expiresAt,
      });
      await this.auditService.record(
        {
          actorUserId: user.id,
          action: 'auth.password_reset.requested',
          targetType: 'User',
          targetId: user.id,
          ...context,
        },
        tx,
      );
    });
  }

  async confirmPasswordReset(
    rawToken: string,
    newPassword: string,
    context: RequestContext = {},
  ): Promise<void> {
    const tokenHash = hashOpaqueToken(rawToken);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await hashPassword(newPassword);

    await this.withUserLock(record.userId, async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new UnauthorizedException('Invalid or expired reset token');
      }

      await this.usersService.updatePasswordHash(
        record.userId,
        passwordHash,
        tx,
      );

      // Every other outstanding reset token, and every outstanding handoff
      // token, must die with the credentials they were issued against.
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.handoffToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      });

      await this.revokeAllSessionsForUser(
        record.userId,
        tx,
        RevocationReason.PasswordReset,
      );
      await tx.session.updateMany({
        where: { userId: record.userId },
        data: { recoveryData: null, recoveryExpiresAt: null },
      });

      const user = await this.usersService.findById(record.userId, tx);
      if (user) {
        await this.emailDeliveries.enqueue(tx, {
          template: 'password-changed',
          recipient: user.email,
        });
      }

      await this.auditService.record(
        {
          actorUserId: record.userId,
          action: 'auth.password_reset.confirmed',
          targetType: 'User',
          targetId: record.userId,
          ...context,
        },
        tx,
      );
    });
  }

  async resendEmailVerification(
    userId: string,
    context: RequestContext = {},
  ): Promise<void> {
    await this.withUserLock(userId, async (tx) => {
      const user = await this.usersService.findById(userId, tx);
      if (!user || user.emailVerifiedAt) return;

      const created = await this.createEmailVerification(user, tx, true);
      if (created) {
        await this.auditService.record(
          {
            actorUserId: user.id,
            action: 'auth.email_verification.resent',
            targetType: 'User',
            targetId: user.id,
            ...context,
          },
          tx,
        );
      }
    });
  }

  async confirmEmailVerification(
    rawToken: string,
    context: RequestContext = {},
  ): Promise<void> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashOpaqueToken(rawToken) },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    await this.withUserLock(record.userId, async (tx) => {
      const user = await this.usersService.findById(record.userId, tx);
      const currentEmail = user
        ? this.usersService.normalizeEmail(user.email)
        : null;
      if (!user || currentEmail !== record.targetEmail) {
        throw new UnauthorizedException(
          'Invalid or expired verification token',
        );
      }

      const now = new Date();
      const claimed = await tx.emailVerificationToken.updateMany({
        where: {
          id: record.id,
          userId: user.id,
          targetEmail: currentEmail,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        throw new UnauthorizedException(
          'Invalid or expired verification token',
        );
      }

      const verified = await tx.user.updateMany({
        where: { id: user.id, email: currentEmail },
        data: { emailVerifiedAt: now, verificationGraceUntil: null },
      });
      if (verified.count !== 1) {
        throw new UnauthorizedException(
          'Invalid or expired verification token',
        );
      }
      await tx.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });
      await this.auditService.record(
        {
          actorUserId: user.id,
          action: 'auth.email_verification.confirmed',
          targetType: 'User',
          targetId: user.id,
          ...context,
        },
        tx,
      );
    });
  }

  /**
   * Mints a one-time code letting the caller's already-verified session on
   * this app be honoured on another app's own login, without handing over a
   * password or a real access/refresh token pair up front — only
   * `exchangeHandoffToken` (below), presenting the code itself, can turn it
   * into one, and only once.
   */
  async mintHandoffToken(
    userId: string,
    context: RequestContext = {},
  ): Promise<HandoffCodeResponse> {
    return this.withUserLock(userId, async (tx) => {
      const rawToken = generateOpaqueToken();
      const tokenHash = hashOpaqueToken(rawToken);
      const expiresAt = new Date(Date.now() + HANDOFF_TOKEN_TTL_SECONDS * 1000);

      await tx.handoffToken.create({
        data: { userId, tokenHash, expiresAt },
      });
      await this.auditService.record(
        {
          actorUserId: userId,
          action: 'auth.handoff.issued',
          targetType: 'User',
          targetId: userId,
          ...context,
        },
        tx,
      );

      return { code: rawToken, expiresIn: HANDOFF_TOKEN_TTL_SECONDS };
    });
  }

  /**
   * Redeems a handoff code for a real token pair — same atomic single-use
   * claim as confirmPasswordReset, so a code can never be exchanged twice
   * even under a concurrent retry.
   */
  async exchangeHandoffToken(
    rawToken: string,
    context: RequestContext = {},
  ): Promise<AuthTokensResponse> {
    const tokenHash = hashOpaqueToken(rawToken);
    const record = await this.prisma.handoffToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired handoff code');
    }

    return this.withUserLock(record.userId, async (tx) => {
      const claimed = await tx.handoffToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new UnauthorizedException('Invalid or expired handoff code');
      }

      const user = await this.usersService.findById(record.userId, tx);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid or expired handoff code');
      }

      await this.auditService.record(
        {
          actorUserId: user.id,
          action: 'auth.handoff.exchanged',
          targetType: 'User',
          targetId: user.id,
          ...context,
        },
        tx,
      );

      const { response } = await this.issueTokens(user, tx, undefined, context);
      return response;
    });
  }

  async listSessions(userId: string): Promise<SessionSummary[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    }));
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    context: RequestContext = {},
  ): Promise<void> {
    await this.withUserLock(userId, async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: sessionId },
      });

      if (!session || session.userId !== userId) {
        throw new NotFoundException('Session not found');
      }

      if (session.revokedAt) {
        return;
      }

      await tx.session.update({
        where: { id: sessionId },
        data: {
          revokedAt: new Date(),
          revokedReason: RevocationReason.SessionRevoked,
        },
      });
      await this.auditService.record(
        {
          actorUserId: userId,
          action: 'auth.session.revoked',
          targetType: 'Session',
          targetId: sessionId,
          ...context,
        },
        tx,
      );
    });
  }

  @Interval(60_000)
  async cleanupExpiredRecoveryData(): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        recoveryData: { not: null },
        recoveryExpiresAt: { lte: new Date() },
      },
      data: { recoveryData: null, recoveryExpiresAt: null },
    });
  }

  // Serializes every mutation of a user's credentials/sessions/tokens behind
  // a PostgreSQL row lock, so concurrent auth mutations for the same user
  // (e.g. two simultaneous refresh calls) resolve deterministically instead
  // of racing. See ledger.service.ts for the same FOR UPDATE pattern applied
  // to seller balances.
  private async withUserLock<T>(
    userId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      return fn(tx);
    });
  }

  private async issueTokens(
    user: User,
    tx: Prisma.TransactionClient = this.prisma,
    familyMeta?: { familyId: string; familyCreatedAt: Date },
    requestMeta: RequestContext = {},
  ): Promise<{ response: AuthTokensResponse; session: Session }> {
    const accessTtlSeconds = this.configService.get<number>(
      'ACCESS_TOKEN_TTL_SECONDS',
      900,
    );
    const refreshTtlSeconds = this.configService.get<number>(
      'REFRESH_TOKEN_TTL_SECONDS',
      2_592_000,
    );

    const now = new Date();
    const familyId = familyMeta?.familyId ?? randomUUID();
    const familyCreatedAt = familyMeta?.familyCreatedAt ?? now;
    // The family's 30-day absolute ceiling; rotation never extends past it,
    // it can only ever bring a replacement's expiry in sooner.
    const familyExpiresAt = new Date(
      familyCreatedAt.getTime() + FAMILY_MAX_LIFETIME_MS,
    );
    const tokenExpiresAt = new Date(now.getTime() + refreshTtlSeconds * 1000);
    const expiresAt =
      tokenExpiresAt < familyExpiresAt ? tokenExpiresAt : familyExpiresAt;

    const rawRefreshToken = generateOpaqueToken();
    const session = await tx.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashOpaqueToken(rawRefreshToken),
        expiresAt,
        familyId,
        familyCreatedAt,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
      },
    });

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, role: user.role, sid: session.id },
      { expiresIn: accessTtlSeconds },
    );

    return {
      response: {
        accessToken,
        refreshToken: rawRefreshToken,
        tokenType: 'Bearer',
        expiresIn: accessTtlSeconds,
        refreshExpiresIn: Math.max(
          0,
          Math.floor((expiresAt.getTime() - Date.now()) / 1000),
        ),
        refreshExpiresAt: expiresAt.toISOString(),
        user: this.toPublicUser(user),
      },
      session,
    };
  }

  private async revokeAllSessionsForUser(
    userId: string,
    tx: Prisma.TransactionClient = this.prisma,
    reason: string = RevocationReason.SessionRevoked,
    exceptFamilyId?: string,
  ): Promise<void> {
    await tx.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptFamilyId ? { familyId: { not: exceptFamilyId } } : {}),
      },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async createEmailVerification(
    user: User,
    tx: Prisma.TransactionClient,
    enforceCooldown: boolean,
  ): Promise<boolean> {
    const targetEmail = this.usersService.normalizeEmail(user.email);
    if (enforceCooldown) {
      const recent = await tx.emailVerificationToken.findFirst({
        where: {
          userId: user.id,
          targetEmail,
          createdAt: {
            gt: new Date(Date.now() - EMAIL_VERIFICATION_RESEND_COOLDOWN_MS),
          },
        },
        select: { id: true },
      });
      if (recent) return false;
    }

    const now = new Date();
    await tx.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
    const rawToken = generateOpaqueToken();
    const expiresAt = new Date(
      now.getTime() + EMAIL_VERIFICATION_TOKEN_TTL_SECONDS * 1000,
    );
    const token = await tx.emailVerificationToken.create({
      data: {
        userId: user.id,
        targetEmail,
        tokenHash: hashOpaqueToken(rawToken),
        expiresAt,
      },
    });
    const verificationUrl = new URL(
      '/verify-email',
      this.configService.getOrThrow<string>('CUSTOMER_WEB_URL'),
    );
    verificationUrl.searchParams.set('token', rawToken);
    await this.emailDeliveries.enqueue(tx, {
      template: 'email-verification',
      recipient: targetEmail,
      variables: {
        verificationUrl: verificationUrl.toString(),
        verificationTokenId: token.id,
      },
      expiresAt,
    });
    return true;
  }

  private encryptionKeyring(
    purpose: 'REFRESH_RECOVERY',
  ): FieldEncryptionKeyring {
    const activeKeyId = this.configService.get<string>(
      `${purpose}_ENCRYPTION_ACTIVE_KEY_ID`,
      '',
    );
    const serializedKeys = this.configService.get<string>(
      `${purpose}_ENCRYPTION_KEYS`,
      '{}',
    );
    return {
      activeKeyId,
      keys: JSON.parse(serializedKeys) as Record<string, string>,
    };
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
    };
  }
}
