import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../../database/prisma.service';
import { AccessTokenPayload } from './access-token-payload';
import { RequestWithUser } from './authenticated-user';
import { IS_OPTIONAL_AUTH_KEY } from './optional-auth.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(
      IS_OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractToken(request);

    if (!token) {
      if (isOptionalAuth) {
        return true;
      }

      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (!payload.sub || !payload.sid) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    // The JWT alone only proves it was signed within its own TTL; it says
    // nothing about a logout, revocation, deactivation, or role change that
    // happened since. Loading the session and its owning user on every
    // request is what makes those take effect immediately instead of
    // waiting out the token's remaining lifetime — role/verification status
    // below come from this fresh read, not from the (possibly stale) JWT
    // claims.
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });

    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.userId !== payload.sub ||
      !session.user ||
      !session.user.isActive
    ) {
      throw new UnauthorizedException('Session has been revoked or expired');
    }

    // Activity is approximate to one minute, avoiding a write on every request.
    const activityCutoff = new Date(now.getTime() - 60_000);
    if (session.lastUsedAt <= activityCutoff) {
      await this.prisma.session.updateMany({
        where: {
          id: session.id,
          userId: session.userId,
          revokedAt: null,
          expiresAt: { gt: now },
          lastUsedAt: { lte: activityCutoff },
        },
        data: { lastUsedAt: now },
      });
    }

    request.user = {
      id: session.user.id,
      role: session.user.role,
      sessionId: session.id,
      emailVerified: session.user.emailVerifiedAt !== null,
      verificationGraceUntil: session.user.verificationGraceUntil,
    };
    return true;
  }

  private extractToken(request: RequestWithUser): string | undefined {
    const header = request.header('authorization');

    if (!header?.startsWith('Bearer ')) {
      return undefined;
    }

    return header.slice('Bearer '.length);
  }
}
