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

type Body<T> = { data: T };

describe('Users and addresses (e2e)', () => {
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

  async function registerAndAuth(
    email: string,
  ): Promise<{ Authorization: string }> {
    const response = (
      await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: 'password123' })
        .expect(201)
    ).body as Body<{ accessToken: string }>;
    return { Authorization: `Bearer ${response.data.accessToken}` };
  }

  const sampleAddress = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    recipientName: 'Jane Doe',
    line1: '123 Main St',
    city: 'Springfield',
    postalCode: '62701',
    country: 'US',
    ...overrides,
  });

  it('updates the caller’s own profile', async () => {
    const headers = await registerAndAuth('profile@example.com');

    const before = (
      await request(server()).get('/api/v1/users/me').set(headers).expect(200)
    ).body as Body<{
      firstName: string | null;
    }>;
    expect(before.data.firstName).toBeNull();

    const after = (
      await request(server())
        .patch('/api/v1/users/me')
        .set(headers)
        .send({ firstName: 'Jane', lastName: 'Doe' })
        .expect(200)
    ).body as Body<{ firstName: string; lastName: string }>;
    expect(after.data).toMatchObject({ firstName: 'Jane', lastName: 'Doe' });
  });

  it('automatically defaults the first address and re-defaults on delete', async () => {
    const headers = await registerAndAuth('addresses@example.com');

    const first = (
      await request(server())
        .post('/api/v1/users/me/addresses')
        .set(headers)
        .send(sampleAddress({ label: 'Home' }))
        .expect(201)
    ).body as Body<{ id: string; isDefault: boolean }>;
    expect(first.data.isDefault).toBe(true);

    const second = (
      await request(server())
        .post('/api/v1/users/me/addresses')
        .set(headers)
        .send(sampleAddress({ label: 'Work', line1: '456 Office Rd' }))
        .expect(201)
    ).body as Body<{ id: string; isDefault: boolean }>;
    expect(second.data.isDefault).toBe(false);

    await request(server())
      .post(`/api/v1/users/me/addresses/${second.data.id}/default`)
      .set(headers)
      .expect(201);

    const list = (
      await request(server())
        .get('/api/v1/users/me/addresses')
        .set(headers)
        .expect(200)
    ).body as Body<{ id: string; isDefault: boolean }[]>;
    expect(
      list.data.find((address) => address.id === second.data.id)?.isDefault,
    ).toBe(true);
    expect(
      list.data.find((address) => address.id === first.data.id)?.isDefault,
    ).toBe(false);

    // Deleting the current default promotes the only remaining address.
    await request(server())
      .delete(`/api/v1/users/me/addresses/${second.data.id}`)
      .set(headers)
      .expect(204);

    const afterDelete = (
      await request(server())
        .get(`/api/v1/users/me/addresses/${first.data.id}`)
        .set(headers)
        .expect(200)
    ).body as Body<{ isDefault: boolean }>;
    expect(afterDelete.data.isDefault).toBe(true);
  });

  it('never lets one customer see or modify another customer’s address', async () => {
    const ownerHeaders = await registerAndAuth('owner@example.com');
    const intruderHeaders = await registerAndAuth('intruder@example.com');

    const address = (
      await request(server())
        .post('/api/v1/users/me/addresses')
        .set(ownerHeaders)
        .send(sampleAddress())
        .expect(201)
    ).body as Body<{ id: string }>;

    await request(server())
      .get(`/api/v1/users/me/addresses/${address.data.id}`)
      .set(intruderHeaders)
      .expect(404);
    await request(server())
      .patch(`/api/v1/users/me/addresses/${address.data.id}`)
      .set(intruderHeaders)
      .send({ city: 'Nowhere' })
      .expect(404);
    await request(server())
      .delete(`/api/v1/users/me/addresses/${address.data.id}`)
      .set(intruderHeaders)
      .expect(404);
  });
});
