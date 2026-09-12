import { ProductReferencesService } from '../products/product-references.service';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role, SellerStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MediaService } from '../media/media.service';
import { SellersService } from './sellers.service';

describe('SellersService', () => {
  const seller = {
    id: 'seller-1',
    ownerUserId: 'owner-1',
    status: SellerStatus.PENDING,
    version: 0,
    documents: [{ mediaAssetId: 'doc-1' }],
  };
  const dto = {
    businessName: 'Example Ltd',
    registrationNumber: 'REG-1',
    businessAddress: '1 Example Road',
    country: 'ZM',
    contactEmail: 'seller@example.com',
    documentIds: ['doc-1'],
  };
  const prisma = {
    user: { findUnique: jest.fn(), updateMany: jest.fn() },
    seller: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    sellerDocument: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    mediaAsset: { updateMany: jest.fn() },
    productMedia: { count: jest.fn() },
    auditEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const media = new MediaService(
    prisma as unknown as PrismaService,
    new ConfigService(),
    {} as never,
  );
  const createDownloadUrlSpy = jest.spyOn(media, 'createDownloadUrl');
  const service = new SellersService(
    prisma as unknown as PrismaService,
    media,
    new ProductReferencesService(prisma as unknown as PrismaService),
    new UsersService(prisma as unknown as PrismaService),
  );

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    prisma.user.findUnique.mockResolvedValue({
      role: Role.ADMIN,
      isActive: true,
    });
    prisma.seller.findUnique.mockResolvedValue(seller);
    prisma.seller.findUniqueOrThrow.mockResolvedValue(seller);
    prisma.seller.create.mockResolvedValue(seller);
    prisma.seller.updateMany.mockResolvedValue({ count: 1 });
    prisma.mediaAsset.updateMany.mockResolvedValue({ count: 1 });
    prisma.productMedia.count.mockResolvedValue(0);
    prisma.sellerDocument.findMany.mockResolvedValue(seller.documents);
  });

  it('binds applications to the authenticated owner and audits creation', async () => {
    await service.apply('owner-1', dto);
    expect(prisma.seller.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerUserId: 'owner-1' }) as unknown,
      }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'seller.applied' }) as unknown,
      }),
    );
  });

  it('rejects missing, unavailable or other-user documents before creating an application', async () => {
    prisma.mediaAsset.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.apply('owner-1', dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.seller.create).not.toHaveBeenCalled();
  });

  it('rejects public product images as private verification evidence', async () => {
    prisma.productMedia.count.mockResolvedValue(1);
    await expect(service.apply('owner-1', dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('scopes profile lookup to the authenticated user', async () => {
    prisma.seller.findUnique.mockResolvedValue(null);
    await expect(service.mine('other-user')).rejects.toThrow(NotFoundException);
    expect(prisma.seller.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerUserId: 'other-user' } }),
    );
  });

  it('rejects admin actions after the administrator role is removed', async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: Role.CUSTOMER,
      isActive: true,
    });
    await expect(
      service.review('admin', seller.id, SellerStatus.APPROVED, {
        version: 0,
        reason: 'Verified',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.seller.updateMany).not.toHaveBeenCalled();
  });

  it('prevents self approval', async () => {
    await expect(
      service.review('owner-1', seller.id, SellerStatus.APPROVED, {
        version: 0,
        reason: 'Verified',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects stale reviews without changing roles or writing a decision audit', async () => {
    prisma.seller.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.review('admin', seller.id, SellerStatus.APPROVED, {
        version: 5,
        reason: 'Verified',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('promotes only customers and records the review in the transaction', async () => {
    await service.review('admin', seller.id, SellerStatus.APPROVED, {
      version: 0,
      reason: 'Verified',
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'owner-1', role: Role.CUSTOMER },
      data: { role: Role.SELLER },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'seller.approved',
          metadata: { from: 'PENDING', to: 'APPROVED', reason: 'Verified' },
        }) as unknown,
      }),
    );
  });

  it('blocks suspended sellers even with an existing access token', async () => {
    prisma.seller.findUnique.mockResolvedValue({
      ...seller,
      status: SellerStatus.SUSPENDED,
    });
    await expect(service.requireApproved('owner-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('does not allow resubmitting an approved or suspended account', async () => {
    prisma.seller.findUnique.mockResolvedValue({
      ...seller,
      status: SellerStatus.APPROVED,
    });
    await expect(service.resubmit('owner-1', dto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('does not issue download URLs for unrelated documents', async () => {
    await expect(
      service.documentUrl('admin', seller.id, 'other-doc'),
    ).rejects.toThrow(NotFoundException);
    expect(createDownloadUrlSpy).not.toHaveBeenCalled();
  });
});
