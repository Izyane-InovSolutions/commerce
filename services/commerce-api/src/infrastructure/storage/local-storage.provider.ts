import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import { StorageProvider, StoredObject } from './storage-provider';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(private readonly config: ConfigService) {
    this.root = resolve(config.getOrThrow<string>('MEDIA_STORAGE_PATH'));
  }

  async put(key: string, body: Buffer, mimeType: string): Promise<void> {
    const path = this.safePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    await writeFile(`${path}.mime`, mimeType, 'utf8');
  }

  async get(key: string): Promise<StoredObject> {
    const path = this.safePath(key);
    try {
      const [body, mimeType] = await Promise.all([
        readFile(path),
        readFile(`${path}.mime`, 'utf8'),
      ]);
      return { body, mimeType };
    } catch {
      throw new NotFoundException('Media content not found');
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.safePath(key);
    await Promise.all([
      rm(path, { force: true }),
      rm(`${path}.mime`, { force: true }),
    ]);
  }

  private safePath(key: string): string {
    const path = resolve(this.root, key);
    if (path !== this.root && !path.startsWith(`${this.root}${sep}`)) {
      throw new Error('Invalid storage key');
    }
    return path;
  }
}
