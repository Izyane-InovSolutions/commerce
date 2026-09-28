import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestWithUser } from './authenticated-user';
import { REQUIRE_VERIFIED_EMAIL_KEY } from './require-verified-email.decorator';

@Injectable()
export class EmailVerificationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_VERIFIED_EMAIL_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (
      user?.emailVerified ||
      (user?.verificationGraceUntil && user.verificationGraceUntil > new Date())
    ) {
      return true;
    }

    throw new ForbiddenException(
      'Verify your email address before using seller features',
    );
  }
}
