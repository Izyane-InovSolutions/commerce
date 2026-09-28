import { ConfigService } from '@nestjs/config';

import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import { resolveStorageProvider } from './storage.module';

describe('resolveStorageProvider', () => {
  // @nestjs/config falls back to process.env for keys missing from its
  // internal config, so an ambient MEDIA_STORAGE_DRIVER would otherwise leak
  // into the "default" case.
  const originalDriver = process.env.MEDIA_STORAGE_DRIVER;

  afterEach(() => {
    if (originalDriver === undefined) delete process.env.MEDIA_STORAGE_DRIVER;
    else process.env.MEDIA_STORAGE_DRIVER = originalDriver;
  });

  it('stores locally by default, without asking for any S3 settings', () => {
    delete process.env.MEDIA_STORAGE_DRIVER;
    const config = new ConfigService({ MEDIA_STORAGE_PATH: '.data/media' });

    expect(resolveStorageProvider(config)).toBeInstanceOf(LocalStorageProvider);
  });

  it('stores locally when MEDIA_STORAGE_DRIVER is "local"', () => {
    const config = new ConfigService({
      MEDIA_STORAGE_DRIVER: 'local',
      MEDIA_STORAGE_PATH: '.data/media',
    });

    expect(resolveStorageProvider(config)).toBeInstanceOf(LocalStorageProvider);
  });

  it('uses S3 when MEDIA_STORAGE_DRIVER is "s3"', () => {
    const config = new ConfigService({
      MEDIA_STORAGE_DRIVER: 's3',
      S3_BUCKET: 'media-bucket',
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY_ID: 'test-access-key',
      S3_SECRET_ACCESS_KEY: 'test-secret-key',
    });

    expect(resolveStorageProvider(config)).toBeInstanceOf(S3StorageProvider);
  });
});
