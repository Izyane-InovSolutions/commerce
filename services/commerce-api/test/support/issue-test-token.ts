import type { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';

import type { FakePrismaService } from './fake-prisma.service';

/**
 * Mints an access token backed by a real, active Session row.
 *
 * JwtAuthGuard checks the session named by the token's `sid` on every
 * request (so a revoked or expired session stops authenticating before its
 * JWT naturally expires) — a hand-rolled `{ sub, role, sid }` payload with a
 * made-up sid has no session behind it and is rejected. This creates one the
 * same way a real login would.
 */
export async function issueTestToken(
  jwtService: JwtService,
  prisma: FakePrismaService,
  userId: string,
  role: Role,
): Promise<string> {
  const session = await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: `test-refresh-hash:${userId}:${role}:${Math.random()}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  return jwtService.signAsync({ sub: userId, role, sid: session.id });
}
