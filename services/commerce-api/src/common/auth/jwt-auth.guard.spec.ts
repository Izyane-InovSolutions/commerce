import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
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

const activeSession = {
  id: 'session-1',
  revokedAt: null,
  expiresAt: new Date(Date.now() + 60_000),
};

describe('JwtAuthGuard', () => {
  let jwtService: { verifyAsync: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };
  let prisma: { session: { findUnique: jest.Mock } };
  let guard: JwtAuthGuard;
  let metadata: Record<string, boolean>;

  beforeEach(() => {
    metadata = {};
    jwtService = { verifyAsync: jest.fn() };
    reflector = {
      getAllAndOverride: jest.fn((key: string) => metadata[key] ?? false),
    };
    prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(activeSession) },
    };
    guard = new JwtAuthGuard(
      jwtService as unknown as JwtService,
      reflector as unknown as Reflector,
      prisma as unknown as PrismaService,
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

  it('attaches the authenticated user on a valid token backed by an active session', async () => {
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
    expect(prisma.session.findUnique).toHaveBeenCalledWith({
      where: { id: 'session-1' },
    });
    expect(request.user).toEqual({
      id: 'user-1',
      role: Role.CUSTOMER,
      sessionId: 'session-1',
    });
  });

  it('rejects a token whose session has been revoked', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      role: Role.CUSTOMER,
      sid: 'session-1',
    });
    prisma.session.findUnique.mockResolvedValue({
      ...activeSession,
      revokedAt: new Date(),
    });
    const context = createContext({
      header: () => 'Bearer good-token',
    } as unknown as RequestWithUser);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token whose session has expired', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      role: Role.CUSTOMER,
      sid: 'session-1',
    });
    prisma.session.findUnique.mockResolvedValue({
      ...activeSession,
      expiresAt: new Date(Date.now() - 1_000),
    });
    const context = createContext({
      header: () => 'Bearer good-token',
    } as unknown as RequestWithUser);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token whose session no longer exists', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      role: Role.CUSTOMER,
      sid: 'session-1',
    });
    prisma.session.findUnique.mockResolvedValue(null);
    const context = createContext({
      header: () => 'Bearer good-token',
    } as unknown as RequestWithUser);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
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
