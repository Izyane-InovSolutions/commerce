import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaAsset, MediaStatus } from '@prisma/client';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { PrismaService } from '../../database/prisma.service';
import { STORAGE_PROVIDER } from '../../infrastructure/storage/storage-provider';
import type {
  StorageProvider,
  StoredObject,
} from '../../infrastructure/storage/storage-provider';
import { ReserveUploadDto } from './dto/reserve-upload.dto';

export type SignedMediaUrl = { url: string; expiresAt: string };
export type SerializedMediaAsset = Omit<MediaAsset, 'byteSize'> & {
  byteSize: number;
};
export type ReservedMediaUpload = {
  asset: SerializedMediaAsset;
  upload: SignedMediaUrl;
};

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async reserve(
    ownerUserId: string,
    dto: ReserveUploadDto,
  ): Promise<ReservedMediaUpload> {
    const maxBytes = this.config.get<number>(
      'MEDIA_MAX_FILE_SIZE_BYTES',
      10_485_760,
    );
    if (dto.byteSize > maxBytes) {
      throw new BadRequestException(`Media must not exceed ${maxBytes} bytes`);
    }
    const asset = await this.prisma.mediaAsset.create({
      data: {
        ownerUserId,
        storageKey: `${ownerUserId}/${randomUUID()}`,
        originalFileName: dto.fileName,
        mimeType: dto.mimeType,
        byteSize: BigInt(dto.byteSize),
      },
    });
    return {
      asset: this.serialize(asset),
      upload: this.sign('upload', asset.id),
    };
  }

  async upload(
    ownerUserId: string,
    id: string,
    expires: string,
    signature: string,
    file?: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<void> {
    const asset = await this.ownedAsset(ownerUserId, id);
    this.verify('upload', id, expires, signature);
    if (
      !file ||
      file.mimetype !== asset.mimeType ||
      BigInt(file.size) !== asset.byteSize
    ) {
      throw new BadRequestException(
        'Uploaded file does not match its reservation',
      );
    }
    await this.storage.put(asset.storageKey, file.buffer, file.mimetype);
    await this.prisma.mediaAsset.update({
      where: { id },
      data: { status: MediaStatus.AVAILABLE },
    });
  }

  async createDownloadUrl(
    ownerUserId: string,
    id: string,
  ): Promise<SignedMediaUrl> {
    const asset = await this.ownedAsset(ownerUserId, id);
    if (asset.status !== MediaStatus.AVAILABLE)
      throw new NotFoundException('Media content not found');
    return this.sign('download', id);
  }

  async download(
    id: string,
    expires: string,
    signature: string,
  ): Promise<StoredObject> {
    this.verify('download', id, expires, signature);
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.status !== MediaStatus.AVAILABLE)
      throw new NotFoundException('Media content not found');
    return this.storage.get(asset.storageKey);
  }

  async delete(ownerUserId: string, id: string): Promise<void> {
    const asset = await this.ownedAsset(ownerUserId, id);
    await this.storage.delete(asset.storageKey);
    await this.prisma.mediaAsset.update({
      where: { id },
      data: { status: MediaStatus.DELETED, deletedAt: new Date() },
    });
  }

  private async ownedAsset(
    ownerUserId: string,
    id: string,
  ): Promise<MediaAsset> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.status === MediaStatus.DELETED)
      throw new NotFoundException('Media asset not found');
    if (asset.ownerUserId !== ownerUserId)
      throw new ForbiddenException('You do not own this media asset');
    return asset;
  }

  private sign(action: 'upload' | 'download', id: string): SignedMediaUrl {
    const ttl = this.config.get<number>('MEDIA_URL_TTL_SECONDS', 900);
    const expires = String(Math.floor(Date.now() / 1000) + ttl);
    const signature = this.signature(action, id, expires);
    const operation = action === 'upload' ? 'content' : 'download';
    return {
      url: `/api/v1/media/${id}/${operation}?expires=${expires}&signature=${signature}`,
      expiresAt: new Date(Number(expires) * 1000).toISOString(),
    };
  }

  private verify(
    action: 'upload' | 'download',
    id: string,
    expires: string,
    signature: string,
  ): void {
    if (
      !/^\d+$/.test(expires) ||
      Number(expires) <= Math.floor(Date.now() / 1000)
    )
      throw new ForbiddenException('Signed media URL has expired');
    const expected = Buffer.from(this.signature(action, id, expires), 'hex');
    const actual = Buffer.from(signature, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new ForbiddenException('Invalid media signature');
  }

  private signature(action: string, id: string, expires: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('MEDIA_SIGNING_SECRET'),
    )
      .update(`${action}:${id}:${expires}`)
      .digest('hex');
  }

  private serialize(asset: MediaAsset): SerializedMediaAsset {
    return { ...asset, byteSize: Number(asset.byteSize) };
  }
}
