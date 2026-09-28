import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { S3StorageProvider } from './s3-storage.provider';

const S3_CONFIG = {
  S3_BUCKET: 'media-bucket',
  S3_REGION: 'auto',
  S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  S3_ACCESS_KEY_ID: 'test-access-key',
  S3_SECRET_ACCESS_KEY: 'test-secret-key',
  S3_FORCE_PATH_STYLE: true,
};

function s3Error(name: string, httpStatusCode: number): S3ServiceException {
  return new S3ServiceException({
    name,
    $fault: 'client',
    $metadata: { httpStatusCode },
    message: name,
  });
}

describe('S3StorageProvider', () => {
  let send: jest.SpyInstance;

  beforeEach(() => {
    send = jest.spyOn(S3Client.prototype, 'send');
  });

  afterEach(() => {
    send.mockRestore();
  });

  function provider(
    overrides: Record<string, unknown> = {},
  ): S3StorageProvider {
    return new S3StorageProvider(
      new ConfigService({ ...S3_CONFIG, ...overrides }),
    );
  }

  it('configures the client from S3_* settings', async () => {
    const storage = provider();
    const client = (storage as unknown as { client: S3Client }).client;

    await expect(client.config.region()).resolves.toBe('auto');
    expect(client.config.forcePathStyle).toBe(true);
    const endpoint = await client.config.endpoint?.();
    expect(endpoint?.hostname).toBe('account.r2.cloudflarestorage.com');
    await expect(client.config.credentials()).resolves.toMatchObject({
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
    });
  });

  it('reads S3_FORCE_PATH_STYLE given as a raw env string', () => {
    const on = provider({ S3_FORCE_PATH_STYLE: 'true' });
    const off = provider({ S3_FORCE_PATH_STYLE: 'false' });

    expect(
      (on as unknown as { client: S3Client }).client.config.forcePathStyle,
    ).toBe(true);
    expect(
      (off as unknown as { client: S3Client }).client.config.forcePathStyle,
    ).toBe(false);
  });

  it('refuses to start without a bucket', () => {
    expect(() => provider({ S3_BUCKET: undefined })).toThrow(/S3_BUCKET/);
  });

  it('puts the object with its content type', async () => {
    send.mockResolvedValue({});
    const body = Buffer.from('image-bytes');

    await provider().put('owner/key', body, 'image/png');

    const [[command]] = send.mock.calls as [[PutObjectCommand]];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'media-bucket',
      Key: 'owner/key',
      Body: body,
      ContentType: 'image/png',
      ContentLength: body.length,
    });
  });

  it('gets the object body and content type back', async () => {
    send.mockResolvedValue({
      Body: {
        transformToByteArray: () => Promise.resolve(new Uint8Array([1, 2, 3])),
      },
      ContentType: 'image/webp',
    });

    const object = await provider().get('owner/key');

    const [[command]] = send.mock.calls as [[GetObjectCommand]];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({ Bucket: 'media-bucket', Key: 'owner/key' });
    expect(object).toEqual({
      body: Buffer.from([1, 2, 3]),
      mimeType: 'image/webp',
    });
  });

  it('maps a missing key to NotFoundException', async () => {
    send.mockRejectedValue(s3Error('NoSuchKey', 404));

    await expect(provider().get('owner/missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps a bare 404 (as some S3-compatible stores return) to NotFoundException', async () => {
    send.mockRejectedValue(s3Error('NotFound', 404));

    await expect(provider().get('owner/missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps an empty body to NotFoundException', async () => {
    send.mockResolvedValue({});

    await expect(provider().get('owner/key')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not disguise an access failure as missing media', async () => {
    const denied = s3Error('AccessDenied', 403);
    send.mockRejectedValue(denied);

    await expect(provider().get('owner/key')).rejects.toBe(denied);
  });

  it('does not disguise a network failure as missing media', async () => {
    const failure = new Error('socket hang up');
    send.mockRejectedValue(failure);

    await expect(provider().get('owner/key')).rejects.toBe(failure);
  });

  it('deletes the object', async () => {
    send.mockResolvedValue({});

    await provider().delete('owner/key');

    const [[command]] = send.mock.calls as [[DeleteObjectCommand]];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({ Bucket: 'media-bucket', Key: 'owner/key' });
  });
});
