import type { Role } from '@prisma/client';

export type PublicUser = {
  id: string;
  email: string;
  role: Role;
  emailVerified: boolean;
};

export type AuthTokensResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresIn: number;
  refreshExpiresAt: string;
  user: PublicUser;
};

export type SessionSummary = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  signedInAt: Date;
  lastUsedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  isCurrent: boolean;
};

/** A one-time code minted for handing a signed-in session off to another
 * app (see AuthService.mintHandoffToken/exchangeHandoffToken). */
export type HandoffCodeResponse = {
  code: string;
  expiresIn: number;
};
