import type { Role } from '@prisma/client';

export type AccessTokenPayload = {
  sub: string;
  role: Role;
  sid: string;
};
