import type { Server } from 'node:http';

import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import type { NextFunction, Response } from 'express';
import request from 'supertest';

import type { RequestWithUser } from '../src/common/auth/authenticated-user';
import { AllExceptionsFilter } from '../src/common/http/all-exceptions.filter';
import { MediaModule } from '../src/modules/media/media.module';
import { MediaService } from '../src/modules/media/media.service';

describe('Media upload transport limit (HTTP)', () => {
  const assetId = '8c873676-f415-4951-b1ba-3dd223acffab';
  let app: INestApplication;
  let upload: jest.Mock;

  beforeAll(async () => {
    upload = jest.fn().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            (): { MEDIA_MAX_FILE_SIZE_BYTES: number } => ({
              MEDIA_MAX_FILE_SIZE_BYTES: 16,
            }),
          ],
        }),
        MediaModule,
      ],
    })
      .overrideProvider(MediaService)
      .useValue({ upload })
      .compile();

    app = moduleRef.createNestApplication();
    app.use(
      (req: RequestWithUser, _res: Response, next: NextFunction): void => {
        req.user = {
          id: 'owner-1',
          role: Role.CUSTOMER,
          sessionId: 'session-1',
          emailVerified: true,
          verificationGraceUntil: null,
        };
        next();
      },
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  beforeEach(() => upload.mockClear());

  afterAll(async () => {
    await app.close();
  });

  it('passes a file at the configured limit to the media service', async () => {
    await request(app.getHttpServer() as Server)
      .put(`/media/${assetId}/content?expires=1&signature=test`)
      .attach('file', Buffer.alloc(16), {
        filename: 'image.png',
        contentType: 'image/png',
      })
      .expect(204);

    expect(upload).toHaveBeenCalledWith(
      'owner-1',
      assetId,
      '1',
      'test',
      expect.objectContaining({ size: 16, buffer: Buffer.alloc(16) }),
    );
  });

  it('rejects an oversized file with 413 before the media service runs', async () => {
    const response = await request(app.getHttpServer() as Server)
      .put(`/media/${assetId}/content?expires=1&signature=test`)
      .attach('file', Buffer.alloc(17), {
        filename: 'image.png',
        contentType: 'image/png',
      })
      .expect(413);

    expect(response.body).toMatchObject({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'File too large' },
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects extra multipart fields before the media service runs', async () => {
    await request(app.getHttpServer() as Server)
      .put(`/media/${assetId}/content?expires=1&signature=test`)
      .field('unused', 'value')
      .attach('file', Buffer.alloc(8), {
        filename: 'image.png',
        contentType: 'image/png',
      })
      .expect(400);

    expect(upload).not.toHaveBeenCalled();
  });
});
