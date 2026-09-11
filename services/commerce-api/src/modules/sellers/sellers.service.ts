import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, SellerStatus } from '@prisma/client';
import type { Seller } from '@prisma/client';
import { ProductReferencesService } from '../products/product-references.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../database/prisma.service';
import { MediaService } from '../media/media.service';
import type { SignedMediaUrl } from '../media/media.service';
import { SellerApplicationDto } from './dto/seller-application.dto';
import { ReviewSellerDto } from './dto/review-seller.dto';
import { SellerQueryDto } from './dto/seller-query.dto';

export type SellerDetail = Seller & {
  documents: { mediaAssetId: string; createdAt: Date }[];
};
export type SellerSummary = Pick<
  Seller,
  'id' | 'businessName' | 'status' | 'createdAt' | 'version'
>;
const includeDocuments = {
  documents: { select: { mediaAssetId: true, createdAt: true } },
} as const;

@Injectable()
export class SellersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly products:ProductReferencesService,
    private readonly users:UsersService,
  ) {}

  async apply(
    userId: string,
    dto: SellerApplicationDto,
  ): Promise<SellerDetail> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.activeUser(tx, userId);
        await this.validateDocuments(tx, userId, dto.documentIds);
        const { documentIds, ...business } = dto;
        const seller = await tx.seller.create({
          data: {
            ...business,
            ownerUserId: userId,
            documents: {
              create: documentIds.map((mediaAssetId) => ({ mediaAssetId })),
            },
          },
          include: includeDocuments,
        });
        await this.audit(tx, userId, seller.id, 'seller.applied');
        return seller;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('You already have a seller application');
      throw error;
    }
  }

  async mine(userId: string): Promise<SellerDetail> {
    await this.activeUser(this.prisma, userId);
    const seller = await this.prisma.seller.findUnique({
      where: { ownerUserId: userId },
      include: includeDocuments,
    });
    if (!seller) throw new NotFoundException('Seller application not found');
    return seller;
  }

  async resubmit(
    userId: string,
    dto: SellerApplicationDto,
  ): Promise<SellerDetail> {
    return this.prisma.$transaction(async (tx) => {
      await this.activeUser(tx, userId);
      const seller = await tx.seller.findUnique({
        where: { ownerUserId: userId },
      });
      if (!seller) throw new NotFoundException('Seller application not found');
      if (seller.status !== SellerStatus.REJECTED)
        throw new ConflictException(
          'Only rejected applications may be resubmitted',
        );
      await this.validateDocuments(tx, userId, dto.documentIds);
      const { documentIds, ...business } = dto;
      const updated = await tx.seller.updateMany({
        where: {
          id: seller.id,
          version: seller.version,
          status: SellerStatus.REJECTED,
        },
        data: {
          ...business,
          status: SellerStatus.PENDING,
          reviewReason: null,
          reviewedAt: null,
          reviewedBy: null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'Application changed; reload and try again',
        );
      await tx.sellerDocument.deleteMany({ where: { sellerId: seller.id } });
      await tx.sellerDocument.createMany({
        data: documentIds.map((mediaAssetId) => ({
          sellerId: seller.id,
          mediaAssetId,
        })),
      });
      await this.audit(tx, userId, seller.id, 'seller.resubmitted');
      return tx.seller.findUniqueOrThrow({
        where: { id: seller.id },
        include: includeDocuments,
      });
    });
  }

  async list(
    actorId: string,
    query: SellerQueryDto,
  ): Promise<{
    items: SellerSummary[];
    total: number;
    page: number;
    limit: number;
  }> {
    await this.admin(actorId);
    const where = { status: query.status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.seller.findMany({
        where,
        select: {
          id: true,
          businessName: true,
          status: true,
          createdAt: true,
          version: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.seller.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async detail(actorId: string, id: string): Promise<SellerDetail> {
    await this.admin(actorId);
    const seller = await this.prisma.seller.findUnique({
      where: { id },
      include: includeDocuments,
    });
    if (!seller) throw new NotFoundException('Seller not found');
    return seller;
  }

  async documentUrl(
    actorId: string,
    id: string,
    mediaAssetId: string,
  ): Promise<SignedMediaUrl> {
    const seller = await this.detail(actorId, id);
    if (
      !seller.documents.some(
        (document) => document.mediaAssetId === mediaAssetId,
      )
    )
      throw new NotFoundException('Verification document not found');
    await this.audit(this.prisma, actorId, id, 'seller.document_viewed');
    return this.media.createDownloadUrl(seller.ownerUserId, mediaAssetId);
  }

  async review(
    actorId: string,
    id: string,
    status: SellerStatus,
    dto: ReviewSellerDto,
  ): Promise<SellerDetail> {
    return this.prisma.$transaction(async (tx) => {
      await this.admin(actorId, tx);
      const seller = await tx.seller.findUnique({ where: { id } });
      if (!seller) throw new NotFoundException('Seller not found');
      if (seller.ownerUserId === actorId)
        throw new ForbiddenException(
          'You cannot review your own seller account',
        );
      const valid =
        (status === SellerStatus.APPROVED &&
          (seller.status === SellerStatus.PENDING ||
            seller.status === SellerStatus.SUSPENDED)) ||
        (status === SellerStatus.REJECTED &&
          seller.status === SellerStatus.PENDING) ||
        (status === SellerStatus.SUSPENDED &&
          seller.status === SellerStatus.APPROVED);
      if (!valid)
        throw new ConflictException('Invalid seller status transition');
      if (status === SellerStatus.APPROVED) {
        const documents = await tx.sellerDocument.findMany({
          where: { sellerId: id },
        });
        await this.validateDocuments(
          tx,
          seller.ownerUserId,
          documents.map((d) => d.mediaAssetId),
        );
        await this.activeUser(tx, seller.ownerUserId);
      }
      const updated = await tx.seller.updateMany({
        where: { id, version: dto.version, status: seller.status },
        data: {
          status,
          reviewReason: dto.reason,
          reviewedBy: actorId,
          reviewedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'Application changed; reload before reviewing',
        );
      if (status === SellerStatus.APPROVED)
        await this.users.promoteCustomerToSeller(seller.ownerUserId,tx);
      await this.audit(tx, actorId, id, `seller.${status.toLowerCase()}`, {
        from: seller.status,
        to: status,
        reason: dto.reason,
      });
      return tx.seller.findUniqueOrThrow({
        where: { id },
        include: includeDocuments,
      });
    });
  }

  async requireApproved(userId: string): Promise<Seller> {
    const seller = await this.mine(userId);
    if (seller.status !== SellerStatus.APPROVED)
      throw new ForbiddenException('Seller approval is required');
    return seller;
  }

  // Hold the seller row through a marketplace write so suspension and
  // publication cannot both pass their approval check concurrently.
  async lockApproved(
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<Seller> {
    await this.activeUser(tx, userId);
    const locked = await tx.seller.updateMany({
      where: { ownerUserId: userId, status: SellerStatus.APPROVED },
      data: { updatedAt: new Date() },
    });
    if (locked.count !== 1)
      throw new ForbiddenException('Seller approval is required');
    return tx.seller.findUniqueOrThrow({ where: { ownerUserId: userId } });
  }

  private async validateDocuments(
    tx: Prisma.TransactionClient,
    userId: string,
    ids: string[],
  ): Promise<void> {
    await this.media.lockVerificationDocuments(userId,ids,tx);
    const published=await this.products.hasMediaAssignments(ids,tx);
    if (published)
      throw new BadRequestException(
        'Product media cannot be used as private verification documents',
      );
  }

  private async activeUser(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    const user = await this.users.findAccessById(id,tx);
    if (!user?.isActive)
      throw new ForbiddenException('Active account required');
  }

  private async admin(
    id: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const user = await this.users.findAccessById(id,tx);
    if (!user?.isActive || user.role !== Role.ADMIN)
      throw new ForbiddenException('Administrator access required');
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    targetId: string,
    action: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.auditEvent.create({
      data: { actorUserId, targetId, targetType: 'Seller', action, metadata },
    });
  }
}
