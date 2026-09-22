import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Session, User } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
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
const HANDOFF_TOKEN_TTL_SECONDS = 60;
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

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
    const user = await this.usersService.create(email, passwordHash);

    await this.auditService.record({
      actorUserId: user.id,
      action: 'auth.register',
      targetType: 'User',
      targetId: user.id,
      ...context,
    });

    return this.issueTokens(user);
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

    await this.auditService.record({
      actorUserId: user.id,
      action: 'auth.login.success',
      targetType: 'User',
      targetId: user.id,
      ...context,
    });

    return this.issueTokens(user);
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

    if (session.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for user ${session.userId}; revoking all sessions`,
      );
      await this.revokeAllSessionsForUser(session.userId);
      await this.auditService.record({
        actorUserId: session.userId,
        action: 'auth.session.reuse_detected',
        targetType: 'Session',
        targetId: session.id,
        ...context,
      });
      throw new UnauthorizedException('Refresh token has already been used');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const user = await this.usersService.findById(session.userId);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(user);
  }

  async logout(
    userId: string,
    rawRefreshToken: string,
    context: RequestContext = {},
  ): Promise<void> {
    const tokenHash = hashOpaqueToken(rawRefreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
    });

    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    if (!session.revokedAt) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      await this.auditService.record({
        actorUserId: userId,
        action: 'auth.logout',
        targetType: 'Session',
        targetId: session.id,
        ...context,
      });
    }
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
    await this.usersService.updatePasswordHash(userId, passwordHash);
    await this.revokeAllSessionsForUser(userId, currentSessionId);
    await this.auditService.record({
      actorUserId: userId,
      action: 'auth.password.changed',
      targetType: 'User',
      targetId: userId,
      ...context,
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

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });
    await this.auditService.record({
      actorUserId: user.id,
      action: 'auth.password_reset.requested',
      targetType: 'User',
      targetId: user.id,
      ...context,
    });

    // Delivery belongs to the later notifications phase. The raw token is
    // deliberately never logged; only its hash is persisted.
    this.logger.debug(`Password reset requested for user ${user.id}`);
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

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new UnauthorizedException('Invalid or expired reset token');
      await this.usersService.updatePasswordHash(
        record.userId,
        passwordHash,
        tx,
      );
    });

    await this.revokeAllSessionsForUser(record.userId);
    await this.auditService.record({
      actorUserId: record.userId,
      action: 'auth.password_reset.confirmed',
      targetType: 'User',
      targetId: record.userId,
      ...context,
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
    const rawToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const expiresAt = new Date(Date.now() + HANDOFF_TOKEN_TTL_SECONDS * 1000);

    await this.prisma.handoffToken.create({
      data: { userId, tokenHash, expiresAt },
    });
    await this.auditService.record({
      actorUserId: userId,
      action: 'auth.handoff.issued',
      targetType: 'User',
      targetId: userId,
      ...context,
    });

    return { code: rawToken, expiresIn: HANDOFF_TOKEN_TTL_SECONDS };
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

    const claimed = await this.prisma.handoffToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new UnauthorizedException('Invalid or expired handoff code');
    }

    const user = await this.usersService.findById(record.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired handoff code');
    }

    await this.auditService.record({
      actorUserId: user.id,
      action: 'auth.handoff.exchanged',
      targetType: 'User',
      targetId: user.id,
      ...context,
    });

    return this.issueTokens(user);
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
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    if (session.revokedAt) {
      return;
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    await this.auditService.record({
      actorUserId: userId,
      action: 'auth.session.revoked',
      targetType: 'Session',
      targetId: sessionId,
      ...context,
    });
  }

  private async issueTokens(user: User): Promise<AuthTokensResponse> {
    const accessTtlSeconds = this.configService.get<number>(
      'ACCESS_TOKEN_TTL_SECONDS',
      900,
    );
    const refreshTtlSeconds = this.configService.get<number>(
      'REFRESH_TOKEN_TTL_SECONDS',
      2_592_000,
    );

    const rawRefreshToken = generateOpaqueToken();
    const session: Session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashOpaqueToken(rawRefreshToken),
        expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
      },
    });

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, role: user.role, sid: session.id },
      { expiresIn: accessTtlSeconds },
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTtlSeconds,
      user: this.toPublicUser(user),
    };
  }

  private async revokeAllSessionsForUser(
    userId: string,
    exceptSessionId?: string,
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  private toPublicUser(user: User): PublicUser {
    return { id: user.id, email: user.email, role: user.role };
  }
}
