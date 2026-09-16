import { ConflictException, NotFoundException } from '@nestjs/common';
import { SupplierStatus } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { SuppliersService } from './suppliers.service';

function buildPrisma(): {
  supplier: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
} {
  return {
    supplier: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

describe('SuppliersService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let auditService: { record: jest.Mock };
  let service: SuppliersService;

  beforeEach(() => {
    prisma = buildPrisma();
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    service = new SuppliersService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );
  });

  describe('create', () => {
    it('reports a duplicate code as a conflict', async () => {
      prisma.supplier.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.create(
          { code: 'ACME', legalName: 'Acme Ltd' } as never,
          'user-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('records an audit event on success', async () => {
      prisma.supplier.create.mockResolvedValue({
        id: 'sup-1',
        code: 'ACME',
        legalName: 'Acme Ltd',
      });

      await service.create(
        { code: 'ACME', legalName: 'Acme Ltd' } as never,
        'user-1',
      );

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'procurement.supplier.created',
          targetId: 'sup-1',
        }),
      );
    });
  });

  describe('update', () => {
    it('rejects a stale version as a conflict', async () => {
      prisma.supplier.updateMany.mockResolvedValue({ count: 0 });
      prisma.supplier.findUnique.mockResolvedValue({ id: 'sup-1' });

      await expect(
        service.update('sup-1', { version: 0 } as never, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('deactivate', () => {
    it('flips status to INACTIVE and records an audit event', async () => {
      prisma.supplier.updateMany.mockResolvedValue({ count: 1 });
      prisma.supplier.findUnique.mockResolvedValue({
        id: 'sup-1',
        status: SupplierStatus.INACTIVE,
        version: 1,
      });

      const result = await service.deactivate('sup-1', 0, 'user-1');

      expect(result.status).toBe(SupplierStatus.INACTIVE);
      expect(prisma.supplier.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sup-1', version: 0 },
          data: expect.objectContaining({ status: SupplierStatus.INACTIVE }) as object,
        }),
      );
    });
  });

  describe('requireActive', () => {
    it('throws when the supplier is inactive', async () => {
      prisma.supplier.findUnique.mockResolvedValue({
        id: 'sup-1',
        status: SupplierStatus.INACTIVE,
      });

      await expect(service.requireActive('sup-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws NotFoundException for an unknown supplier', async () => {
      prisma.supplier.findUnique.mockResolvedValue(null);

      await expect(service.requireActive('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
