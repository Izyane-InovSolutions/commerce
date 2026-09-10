import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';

import { RequestWithUser } from './authenticated-user';
import { IS_OPTIONAL_AUTH_KEY } from './optional-auth.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

function createContext(request: Partial<RequestWithUser>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let jwtService: { verifyAsync: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: JwtAuthGuard;
  let metadata: Record<string, boolean>;

  beforeEach(() => {
    metadata = {};
    jwtService = { verifyAsync: jest.fn() };
    reflector = {
      getAllAndOverride: jest.fn((key: string) => metadata[key] ?? false),
    };
    guard = new JwtAuthGuard(
      jwtService as unknown as JwtService,
      reflector as unknown as Reflector,
    );
  });

  it('allows public routes without checking a token', async () => {
    metadata[IS_PUBLIC_KEY] = true;
    const context = createContext({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects a request with no bearer header', async () => {
    const context = createContext({
      header: () => undefined,
    } as unknown as RequestWithUser);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an invalid or expired token', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));
    const context = createContext({
      header: () => 'Bearer bad-token',
    } as unknown as RequestWithUser);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the authenticated user on a valid token', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      role: Role.CUSTOMER,
      sid: 'session-1',
    });
    const request = {
      header: () => 'Bearer good-token',
    } as unknown as RequestWithUser;
    const context = createContext(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: 'user-1',
      role: Role.CUSTOMER,
      sessionId: 'session-1',
    });
  });

  describe('@OptionalAuth()', () => {
    beforeEach(() => {
      metadata[IS_OPTIONAL_AUTH_KEY] = true;
    });

    it('proceeds without attaching a user when no token is present', async () => {
      const request = { header: () => undefined } as unknown as RequestWithUser;
      const context = createContext(request);

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toBeUndefined();
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('attaches the user when a valid token is present', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        role: Role.CUSTOMER,
        sid: 'session-1',
      });
      const request = {
        header: () => 'Bearer good-token',
      } as unknown as RequestWithUser;
      const context = createContext(request);

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toEqual({
        id: 'user-1',
        role: Role.CUSTOMER,
        sessionId: 'session-1',
      });
    });

    it('still rejects a present but invalid token', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));
      const context = createContext({
        header: () => 'Bearer bad-token',
      } as unknown as RequestWithUser);

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
