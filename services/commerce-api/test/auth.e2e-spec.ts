import {
  INestApplication,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ValidationException } from '../src/common/http/validation-exception';
import { PrismaService } from '../src/database/prisma.service';
import { FakePrismaService } from './support/fake-prisma.service';

type TokensBody = {
  data: {
    accessToken: string;
    refreshToken: string;
    refreshExpiresIn: number;
    refreshExpiresAt: string;
    user: { id: string; email: string; role: string; emailVerified: boolean };
  };
};
type ErrorBody = { error: { code: string } };
type SessionsBody = {
  data: Array<{
    id: string;
    signedInAt: string;
    lastUsedAt: string;
    ipAddress: string | null;
    userAgent: string | null;
    isCurrent: boolean;
  }>;
};

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(new FakePrismaService())
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
        exceptionFactory: (errors: ValidationError[]): ValidationException =>
          new ValidationException(errors),
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = (): Server => app.getHttpServer() as Server;

  it('rejects an unauthenticated request to a protected route', async () => {
    const response = await request(server()).get('/api/v1/auth/me').expect(401);
    const body = response.body as ErrorBody;

    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('supports register, authenticated access, refresh rotation, and logout', async () => {
    const registerResponse = await request(server())
      .post('/api/v1/auth/register')
      .send({ email: 'shopper@example.com', password: 'password123' })
      .expect(201);
    const { accessToken, refreshToken, user } = (
      registerResponse.body as TokensBody
    ).data;

    expect(user.email).toBe('shopper@example.com');
    expect(user.role).toBe('CUSTOMER');
    expect(user.emailVerified).toBe(false);
    const initialTokens = (registerResponse.body as TokensBody).data;
    const initialDeadline = Date.parse(initialTokens.refreshExpiresAt);
    expect(Number.isFinite(initialDeadline)).toBe(true);
    expect(initialTokens.refreshExpiresIn).toBeGreaterThan(0);
    expect(initialTokens.refreshExpiresIn).toBeLessThanOrEqual(2_592_000);
    expect(
      Math.abs(
        initialDeadline - Date.now() - initialTokens.refreshExpiresIn * 1000,
      ),
    ).toBeLessThan(5_000);

    await request(server())
      .post('/api/v1/auth/register')
      .send({ email: 'shopper@example.com', password: 'password123' })
      .expect(409);

    const meResponse = await request(server())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect((meResponse.body as { data: { id: string } }).data.id).toBe(user.id);

    await request(server())
      .post('/api/v1/auth/email-verification/resend')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    const refreshResponse = await request(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    const rotated = (refreshResponse.body as TokensBody).data;
    expect(rotated.refreshToken).not.toBe(refreshToken);
    expect(rotated.refreshExpiresAt).toBe(initialTokens.refreshExpiresAt);
    expect(rotated.refreshExpiresIn).toBeLessThanOrEqual(
      initialTokens.refreshExpiresIn,
    );

    // The rotated access token is backed by its own, still-active session.
    await request(server())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${rotated.accessToken}`)
      .expect(200);

    await request(server())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${rotated.accessToken}`)
      .send({ refreshToken: rotated.refreshToken })
      .expect(204);

    await request(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.refreshToken })
      .expect(401);
  });

  it('returns the same replacement when a rotated token is retried inside the recovery window', async () => {
    const registerResponse = await request(server())
      .post('/api/v1/auth/register')
      .send({ email: 'reuse-victim@example.com', password: 'password123' })
      .expect(201);
    const { refreshToken } = (registerResponse.body as TokensBody).data;

    const refreshResponse = await request(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    const rotated = (refreshResponse.body as TokensBody).data;

    // A response can be lost after the server commits rotation. Retrying the
    // original token during the short recovery window must return the exact
    // replacement rather than creating another session or treating a normal
    // network retry as theft.
    const recoveryResponse = await request(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    const recovered = (recoveryResponse.body as TokensBody).data;
    expect(recovered.accessToken).toBe(rotated.accessToken);
    expect(recovered.refreshToken).toBe(rotated.refreshToken);
    expect(recovered.refreshExpiresAt).toBe(rotated.refreshExpiresAt);
    expect(recovered.refreshExpiresIn).toBe(rotated.refreshExpiresIn);

    // Recovery leaves the one replacement session active.
    await request(server())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${rotated.accessToken}`)
      .expect(200);

    // The recovered replacement can itself rotate normally.
    await request(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.refreshToken })
      .expect(200);
  });

  it('rejects login with the wrong password', async () => {
    await request(server())
      .post('/api/v1/auth/register')
      .send({ email: 'login-test@example.com', password: 'password123' })
      .expect(201);

    await request(server())
      .post('/api/v1/auth/login')
      .send({ email: 'login-test@example.com', password: 'wrong-password' })
      .expect(401);

    await request(server())
      .post('/api/v1/auth/login')
      .send({ email: 'login-test@example.com', password: 'password123' })
      .expect(200);
  });

  it('lists safe metadata and revokes individual and other login families immediately', async () => {
    await request(server()).get('/api/v1/auth/sessions').expect(401);
    await request(server()).delete('/api/v1/auth/sessions/others').expect(401);
    const registration = await request(server())
      .post('/api/v1/auth/register')
      .set('User-Agent', 'Session test browser')
      .send({
        email: 'session-management@example.com',
        password: 'password123',
      })
      .expect(201);
    const current = (registration.body as TokensBody).data;
    const login = async (): Promise<TokensBody['data']> => {
      const response = await request(server())
        .post('/api/v1/auth/login')
        .send({
          email: 'session-management@example.com',
          password: 'password123',
        })
        .expect(200);
      return (response.body as TokensBody).data;
    };
    const other = await login();
    const list = await request(server())
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${current.accessToken}`)
      .expect(200);
    const sessions = (list.body as SessionsBody).data;
    expect(sessions).toHaveLength(2);
    const own = sessions.find((session) => session.isCurrent)!;
    const target = sessions.find((session) => !session.isCurrent)!;
    expect(own.userAgent).toBe('Session test browser');
    expect(own.ipAddress).toEqual(expect.any(String));
    expect(Number.isFinite(Date.parse(own.signedInAt))).toBe(true);
    expect(Number.isFinite(Date.parse(own.lastUsedAt))).toBe(true);
    for (const session of sessions) {
      expect(session).not.toHaveProperty('refreshTokenHash');
      expect(session).not.toHaveProperty('recoveryData');
    }
    const foreignLogin = await request(server())
      .post('/api/v1/auth/login')
      .send({ email: 'login-test@example.com', password: 'password123' })
      .expect(200);
    const foreign = (foreignLogin.body as TokensBody).data;
    await request(server())
      .delete(`/api/v1/auth/sessions/${target.id}`)
      .set('Authorization', `Bearer ${foreign.accessToken}`)
      .expect(404);
    await request(server())
      .delete('/api/v1/auth/sessions/not-a-uuid')
      .set('Authorization', `Bearer ${current.accessToken}`)
      .expect(400);
    const rotation = await request(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: other.refreshToken })
      .expect(200);
    const replacement = (rotation.body as TokensBody).data;
    await request(server())
      .delete(`/api/v1/auth/sessions/${target.id}`)
      .set('Authorization', `Bearer ${current.accessToken}`)
      .expect(204);
    await request(server())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${replacement.accessToken}`)
      .expect(401);
    await request(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: replacement.refreshToken })
      .expect(401);
    // A retry of the pre-rotation token after deliberate revocation must not
    // be treated as theft and revoke the caller's other, still-active login.
    await request(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: other.refreshToken })
      .expect(401);
    const next = await login();
    await request(server())
      .delete('/api/v1/auth/sessions/others')
      .set('Authorization', `Bearer ${current.accessToken}`)
      .expect(204);
    await request(server())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${next.accessToken}`)
      .expect(401);
    await request(server())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${current.accessToken}`)
      .expect(200);
    await request(server())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${foreign.accessToken}`)
      .expect(200);
    await request(server())
      .delete(`/api/v1/auth/sessions/${own.id}`)
      .set('Authorization', `Bearer ${current.accessToken}`)
      .expect(204);
    await request(server())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${current.accessToken}`)
      .expect(401);
  });
});
