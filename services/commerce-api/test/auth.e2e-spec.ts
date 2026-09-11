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
    user: { id: string; email: string; role: string };
  };
};
type ErrorBody = { error: { code: string } };

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

    await request(server())
      .post('/api/v1/auth/register')
      .send({ email: 'shopper@example.com', password: 'password123' })
      .expect(409);

    const meResponse = await request(server())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect((meResponse.body as { data: { id: string } }).data.id).toBe(user.id);

    const refreshResponse = await request(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    const rotated = (refreshResponse.body as TokensBody).data;
    expect(rotated.refreshToken).not.toBe(refreshToken);

    // The original refresh token was rotated away — presenting it again is reuse.
    await request(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);

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
});
