import {
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { StorageProvider, StoredObject } from './storage-provider';

/**
 * Stores media in an S3-compatible bucket — AWS S3 itself, or Cloudflare R2 /
 * MinIO via S3_ENDPOINT.
 *
 * Objects stay private. Downloads still go through the API's own signed
 * /media/:id/download route, which reads the object back through get(),
 * rather than handing out bucket presigned URLs: that keeps one URL scheme
 * and one expiry/signature check whichever driver is configured, and needs
 * no extra presigner dependency.
 *
 * The MIME type travels as the object's Content-Type, the S3 equivalent of
 * the local provider's ".mime" sidecar file.
 *
 * Constructed by StorageModule's factory only when MEDIA_STORAGE_DRIVER=s3,
 * so the S3_* settings it reads with getOrThrow are guaranteed present by
 * env validation in that case and never demanded otherwise.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    const endpoint = config.get<string>('S3_ENDPOINT') || undefined;
    this.client = new S3Client({
      region: config.getOrThrow<string>('S3_REGION'),
      endpoint,
      // MinIO, and most self-hosted endpoints, only serve path-style
      // requests (endpoint/bucket/key) rather than bucket.endpoint/key.
      // Env validation keeps this as the string "true"/"false"; a boolean
      // (e.g. from a test's ConfigService) is accepted too.
      forcePathStyle:
        String(config.get<boolean | string>('S3_FORCE_PATH_STYLE', false)) ===
        'true',
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
    });
  }

  async put(key: string, body: Buffer, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
        ContentLength: body.length,
      }),
    );
  }

  async get(key: string): Promise<StoredObject> {
    let object: GetObjectCommandOutput;
    try {
      object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      if (isMissingObject(error))
        throw new NotFoundException('Media content not found');
      throw error;
    }
    if (!object.Body) throw new NotFoundException('Media content not found');
    return {
      body: Buffer.from(await object.Body.transformToByteArray()),
      mimeType: object.ContentType ?? 'application/octet-stream',
    };
  }

  // S3 DeleteObject already succeeds for a key that doesn't exist, matching
  // the local provider's rm({ force: true }).
  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

// Only a genuinely missing object becomes a 404. Credential, permission and
// network failures must surface as errors rather than look like absent media.
function isMissingObject(error: unknown): boolean {
  if (!(error instanceof S3ServiceException)) return false;
  return error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404;
}
