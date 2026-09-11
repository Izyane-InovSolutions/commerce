import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

import { RequestWithUser } from './authenticated-user';
import { RolesGuard } from './roles.guard';

function createContext(request: Partial<RequestWithUser>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows the request through when no roles are required', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createContext({});

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows the request when the user has one of the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN, Role.STAFF]);
    const context = createContext({
      user: { id: 'u1', role: Role.STAFF, sessionId: 's1' },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects the request when the user lacks a required role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    const context = createContext({
      user: { id: 'u1', role: Role.CUSTOMER, sessionId: 's1' },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
