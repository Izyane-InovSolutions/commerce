import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaStatus } from '@prisma/client';
import { createHmac } from 'node:crypto';

import { PrismaService } from '../../database/prisma.service';
import type { StorageProvider } from '../../infrastructure/storage/storage-provider';
import { MediaService } from './media.service';

const SECRET = 'a-media-signing-secret-that-is-long-enough';
const OWNER = 'owner-1';
const ASSET_ID = 'asset-1';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0x00, 0x00, 0x00, 0x0d]),
  Buffer.from('IHDR', 'latin1'),
  Buffer.alloc(8),
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

describe('MediaService.upload content check', () => {
  let prisma: {
    mediaAsset: { findUnique: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let put: jest.Mock;
  let service: MediaService;

  function signedUpload(): { expires: string; signature: string } {
    const expires = String(Math.floor(Date.now() / 1000) + 600);
    const signature = createHmac('sha256', SECRET)
      .update(`upload:${ASSET_ID}:${expires}`)
      .digest('hex');
    return { expires, signature };
  }

  function reserved(mimeType: string, byteSize: number): void {
    prisma.mediaAsset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      ownerUserId: OWNER,
      storageKey: `${OWNER}/key`,
      mimeType,
      byteSize: BigInt(byteSize),
      status: MediaStatus.PENDING_UPLOAD,
      verificationLocked: false,
    });
  }

  beforeEach(() => {
    prisma = {
      mediaAsset: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
    );
    put = jest.fn().mockResolvedValue(undefined);
    const storage: StorageProvider = {
      put,
      get: jest.fn(),
      delete: jest.fn(),
    };
    service = new MediaService(
      prisma as unknown as PrismaService,
      new ConfigService({ MEDIA_SIGNING_SECRET: SECRET }),
      storage,
    );
  });

  it('stores content whose bytes match the reserved type', async () => {
    reserved('image/png', PNG.length);
    const { expires, signature } = signedUpload();

    await service.upload(OWNER, ASSET_ID, expires, signature, {
      buffer: PNG,
      mimetype: 'image/png',
      size: PNG.length,
    });

    expect(put).toHaveBeenCalledWith(`${OWNER}/key`, PNG, 'image/png');
  });

  it('rejects a PNG sent with a JPEG Content-Type against a JPEG reservation', async () => {
    reserved('image/jpeg', PNG.length);
    const { expires, signature } = signedUpload();

    await expect(
      service.upload(OWNER, ASSET_ID, expires, signature, {
        buffer: PNG,
        mimetype: 'image/jpeg',
        size: PNG.length,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects HTML dressed up as a WebP image', async () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    reserved('image/webp', html.length);
    const { expires, signature } = signedUpload();

    await expect(
      service.upload(OWNER, ASSET_ID, expires, signature, {
        buffer: html,
        mimetype: 'image/webp',
        size: html.length,
      }),
    ).rejects.toThrow('Uploaded file content is not a valid image/webp file');
    expect(put).not.toHaveBeenCalled();
  });

  it('still rejects a declared type that differs from the reservation', async () => {
    reserved('image/png', JPEG.length);
    const { expires, signature } = signedUpload();

    await expect(
      service.upload(OWNER, ASSET_ID, expires, signature, {
        buffer: JPEG,
        mimetype: 'image/jpeg',
        size: JPEG.length,
      }),
    ).rejects.toThrow('Uploaded file does not match its reservation');
  });
});
