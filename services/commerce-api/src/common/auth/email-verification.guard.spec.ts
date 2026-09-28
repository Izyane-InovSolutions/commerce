import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

import { EmailVerificationGuard } from './email-verification.guard';

describe('EmailVerificationGuard', () => {
  const context = (user?: Record<string, unknown>): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    }) as unknown as ExecutionContext;

  it('allows routes that do not require verification', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };
    const guard = new EmailVerificationGuard(reflector as unknown as Reflector);

    expect(guard.canActivate(context())).toBe(true);
  });

  it('allows a verified user', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    };
    const guard = new EmailVerificationGuard(reflector as unknown as Reflector);

    expect(
      guard.canActivate(
        context({
          id: 'user-1',
          role: Role.SELLER,
          sessionId: 'session-1',
          emailVerified: true,
          verificationGraceUntil: null,
        }),
      ),
    ).toBe(true);
  });

  it('allows an unverified existing seller during the rollout grace period', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    };
    const guard = new EmailVerificationGuard(reflector as unknown as Reflector);

    expect(
      guard.canActivate(
        context({
          emailVerified: false,
          verificationGraceUntil: new Date(Date.now() + 60_000),
        }),
      ),
    ).toBe(true);
  });

  it('rejects an unverified user without an active grace period', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    };
    const guard = new EmailVerificationGuard(reflector as unknown as Reflector);

    expect(() =>
      guard.canActivate(
        context({ emailVerified: false, verificationGraceUntil: null }),
      ),
    ).toThrow(ForbiddenException);
  });
});
