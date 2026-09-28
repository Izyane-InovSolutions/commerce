import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import { STORAGE_PROVIDER } from './storage-provider';
import type { StorageProvider } from './storage-provider';

// A plain function so the driver toggle is unit-testable without the DI
// graph. Only the selected provider is constructed: building the S3 one
// eagerly would demand S3_* settings from deployments that store locally.
export function resolveStorageProvider(config: ConfigService): StorageProvider {
  return config.get('MEDIA_STORAGE_DRIVER', 'local') === 's3'
    ? new S3StorageProvider(config)
    : new LocalStorageProvider(config);
}

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: resolveStorageProvider,
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
