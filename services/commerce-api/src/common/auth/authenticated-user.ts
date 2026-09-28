import type { Request } from 'express';
import type { Role } from '@prisma/client';

export type AuthenticatedUser = {
  id: string;
  role: Role;
  sessionId: string;
  emailVerified: boolean;
};

export type RequestWithUser = Request & { user?: AuthenticatedUser };
