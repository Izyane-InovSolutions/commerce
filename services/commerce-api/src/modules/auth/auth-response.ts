import type { Role } from '@prisma/client';

export type PublicUser = {
  id: string;
  email: string;
  role: Role;
};

export type AuthTokensResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: PublicUser;
};

export type SessionSummary = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
};

/** A one-time code minted for handing a signed-in session off to another
 * app (see AuthService.mintHandoffToken/exchangeHandoffToken). */
export type HandoffCodeResponse = {
  code: string;
  expiresIn: number;
};
