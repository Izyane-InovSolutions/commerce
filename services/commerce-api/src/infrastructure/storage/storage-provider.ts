export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export type StoredObject = {
  body: Buffer;
  mimeType: string;
};

export interface StorageProvider {
  put(key: string, body: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
}
