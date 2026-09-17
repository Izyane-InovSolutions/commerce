import {
  INestApplication,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import type { Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ValidationException } from '../src/common/http/validation-exception';
import { PrismaService } from '../src/database/prisma.service';
import { createApiDocument } from '../src/common/openapi/create-api-document';
import { SwaggerModule } from '@nestjs/swagger';
import type {
  OpenAPIObject,
  OperationObject,
  SchemaObject,
} from '@nestjs/swagger';

type SuccessBody = { data: unknown; meta: { requestId: string } };
type ErrorBody = { error: { code: string }; requestId: string };

describe('Commerce API (e2e)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: () => Promise.resolve(),
        $disconnect: () => Promise.resolve(),
      })
      .overrideProvider(PrismaHealthIndicator)
      .useValue({
        pingCheck: () => Promise.resolve({ database: { status: 'up' } }),
      })
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
    document = createApiDocument(app);
    SwaggerModule.setup('api/docs', app, document);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/api/v1/health')
      .expect(200);
    const body = response.body as SuccessBody;

    expect(body.data).toEqual({ status: 'ok' });
    expect(body.meta.requestId).toEqual(expect.any(String));
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('GET /api/v1/health/ready', async () => {
    await request(app.getHttpServer() as Server)
      .get('/api/v1/health/ready')
      .expect(200);
  });

  it('returns a structured error envelope for unknown routes', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/api/v1/does-not-exist')
      .expect(404);
    const body = response.body as ErrorBody;

    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.requestId).toEqual(expect.any(String));
  });

  it('serves the complete OpenAPI document and resolves every schema reference', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/api/docs-json')
      .expect(200);
    expect(response.body).toEqual(document);
    const operations = Object.values(document.paths).flatMap((item) =>
      ['get', 'post', 'put', 'patch', 'delete'].flatMap((verb) => {
        const operation = item[verb as 'get'];
        return operation ? [operation] : [];
      }),
    );
    expect(operations).toHaveLength(198);
    for (const operation of operations) {
      expect(operation.security).toBeDefined();
      expect(operation.responses.default).toBeDefined();
      for (const [status, response] of Object.entries(operation.responses)) {
        if (!response || '$ref' in response) continue;
        if (status === '204') expect(response.content).toBeUndefined();
        else expect(response.content).toBeDefined();
      }
    }
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      if ('$ref' in value) {
        const name = String(value.$ref).replace('#/components/schemas/', '');
        expect(document.components?.schemas?.[name]).toBeDefined();
      }
      Object.values(value).forEach(visit);
    };
    visit(document);
  });

  it('documents validation constraints, optional updates and product filters', () => {
    const schemas = document.components?.schemas as Record<
      string,
      SchemaObject
    >;
    expect(schemas.InputRegisterDto).toMatchObject({
      required: ['email', 'password'],
      additionalProperties: false,
      properties: {
        email: { type: 'string', format: 'email' },
        password: { minLength: 8 },
      },
    });
    expect(schemas.InputUpdateAddressDto?.required).toBeUndefined();
    expect(
      schemas.InputCreateVariantDto?.properties?.attributeValueIds,
    ).toMatchObject({
      type: 'array',
      uniqueItems: true,
      items: { format: 'uuid' },
    });
    const products = document.paths['/api/v1/catalog/products']
      ?.get as OperationObject;
    expect(products.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'limit',
          required: false,
        }),
        expect.objectContaining({
          name: 'attributeValueId',
          style: 'form',
          explode: true,
        }),
      ]),
    );
    expect(
      products.parameters?.find(
        (parameter) => 'name' in parameter && parameter.name === 'limit',
      ),
    ).toMatchObject({ schema: { default: 20, maximum: 100 } });
    expect(schemas.InputUpdateStatusDto?.properties?.status).toMatchObject({
      enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
    });
  });

  it('documents authentication, envelopes and nested response fields', () => {
    expect(document.components?.securitySchemes?.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    expect(document.paths['/api/v1/auth/register']?.post?.security).toEqual([]);
    expect(document.paths['/api/v1/auth/me']?.get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/api/v1/cart']?.get?.security).toEqual([
      {},
      { bearer: [] },
    ]);
    const schemas = document.components?.schemas as Record<
      string,
      SchemaObject
    >;
    expect(Object.keys(schemas.AuthTokensResponse?.properties ?? {})).toEqual([
      'accessToken',
      'refreshToken',
      'tokenType',
      'expiresIn',
      'user',
    ]);
    expect(schemas.PublicUser?.properties).not.toHaveProperty('passwordHash');
    expect(schemas.ProductWithRelations?.properties).toHaveProperty('variants');
    expect(schemas.ProductWithRelations?.properties).toHaveProperty('media');
    expect(schemas.SessionSummary?.properties?.createdAt).toMatchObject({
      type: 'string',
      format: 'date-time',
    });
    const response =
      document.paths['/api/v1/auth/register']?.post?.responses['201'];
    expect(response).toMatchObject({
      content: {
        'application/json': { schema: { required: ['data', 'meta'] } },
      },
    });
  });

  it('documents file transport and the pending webhook without inventing provider fields', () => {
    const upload = document.paths['/api/v1/media/{id}/content']?.put;
    expect(upload?.requestBody).toMatchObject({
      content: {
        'multipart/form-data': {
          schema: {
            required: ['file'],
            properties: { file: { type: 'string', format: 'binary' } },
          },
        },
      },
    });
    const download = document.paths['/api/v1/media/{id}/download']?.get;
    expect(download?.security).toEqual([]);
    expect(download?.responses['200']).toMatchObject({
      content: { 'image/jpeg': { schema: { format: 'binary' } } },
    });
    const webhook = document.paths['/api/v1/payments/webhook']?.post;
    expect(webhook?.description).toContain('pending');
    expect(webhook?.responses['503']).toBeDefined();
    expect(webhook?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'x-webhook-signature',
          required: true,
        }),
      ]),
    );
  });
});
