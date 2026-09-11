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
