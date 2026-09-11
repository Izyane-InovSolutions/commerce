import { Global, Module } from '@nestjs/common';

import { LocalStorageProvider } from './local-storage.provider';
import { STORAGE_PROVIDER } from './storage-provider';

@Global()
@Module({
  providers: [
    LocalStorageProvider,
    { provide: STORAGE_PROVIDER, useExisting: LocalStorageProvider },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
