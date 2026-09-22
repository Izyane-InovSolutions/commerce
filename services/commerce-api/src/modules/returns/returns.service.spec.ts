import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ReturnDisposition,
  ReturnStatus,
  Role,
  RefundCaseSource,
  RefundCaseStatus,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { NumberingService } from '../../common/numbering/numbering.service';
import { InventoryService } from '../inventory/inventory.service';
import { RefundCasesService } from '../payments/refund-cases.service';
import { ReturnsService } from './returns.service';
import {
  DeliveredChunk,
  allocateGreedy,
  computeItemEligibility,
} from './return-eligibility';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

// ---------------------------------------------------------------------------
// Pure eligibility / allocation math
// ---------------------------------------------------------------------------

describe('computeItemEligibility', () => {
  it('is ineligible when the product is not returnable', () => {
    const chunks: DeliveredChunk[] = [
      {
        shipmentLineId: 's1',
        deliveredAt: daysAgo(1),
        quantity: 2,
        claimedQuantity: 0,
      },
    ];
    const result = computeItemEligibility(false, null, chunks);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/not returnable/);
  });

  it('is ineligible when nothing has been delivered', () => {
    const result = computeItemEligibility(true, 30, []);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/not been delivered/);
  });

  it('applies the product-specific window over the 30-day default', () => {
    const chunks: DeliveredChunk[] = [
      {
        shipmentLineId: 's1',
        deliveredAt: daysAgo(10),
        quantity: 2,
        claimedQuantity: 0,
      },
    ];
    const withDefault = computeItemEligibility(true, null, chunks);
    const withOverride = computeItemEligibility(true, 5, chunks);
    expect(withDefault.eligible).toBe(true);
    expect(withOverride.eligible).toBe(false);
    expect(withOverride.reason).toMatch(/expired/);
  });

  it('is ineligible once the window has expired', () => {
    const chunks: DeliveredChunk[] = [
      {
        shipmentLineId: 's1',
        deliveredAt: daysAgo(40),
        quantity: 2,
        claimedQuantity: 0,
      },
    ];
    const result = computeItemEligibility(true, 30, chunks);
    expect(result.eligible).toBe(false);
  });

  it('is ineligible once the whole chunk is already claimed by another return', () => {
    const chunks: DeliveredChunk[] = [
      {
        shipmentLineId: 's1',
        deliveredAt: daysAgo(1),
        quantity: 2,
        claimedQuantity: 2,
      },
    ];
    const result = computeItemEligibility(true, 30, chunks);
    expect(result.eligible).toBe(false);
    expect(result.totalRemainingQuantity).toBe(0);
  });
});

describe('allocateGreedy', () => {
  it('consumes the oldest delivered chunk first across split deliveries', () => {
    const chunks = computeItemEligibility(true, 30, [
      {
        shipmentLineId: 'new',
        deliveredAt: daysAgo(1),
        quantity: 5,
        claimedQuantity: 0,
      },
      {
        shipmentLineId: 'old',
        deliveredAt: daysAgo(10),
        quantity: 3,
        claimedQuantity: 0,
      },
    ]).chunks;

    const allocation = allocateGreedy(chunks, 4);
    expect(allocation).toEqual([
      { shipmentLineId: 'old', quantity: 3 },
      { shipmentLineId: 'new', quantity: 1 },
    ]);
  });

  it('rejects (returns null) rather than partially fulfilling when quantity exceeds availability', () => {
    const chunks = computeItemEligibility(true, 30, [
      {
        shipmentLineId: 'only',
        deliveredAt: daysAgo(1),
        quantity: 2,
        claimedQuantity: 0,
      },
    ]).chunks;

    expect(allocateGreedy(chunks, 3)).toBeNull();
  });

  it('never allocates against a chunk already fully claimed by another active return', () => {
    const chunks = computeItemEligibility(true, 30, [
      {
        shipmentLineId: 'claimed',
        deliveredAt: daysAgo(1),
        quantity: 2,
        claimedQuantity: 2,
      },
      {
        shipmentLineId: 'open',
        deliveredAt: daysAgo(2),
        quantity: 1,
        claimedQuantity: 0,
      },
    ]).chunks;

    expect(allocateGreedy(chunks, 1)).toEqual([
      { shipmentLineId: 'open', quantity: 1 },
    ]);
    expect(allocateGreedy(chunks, 2)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ReturnsService (Prisma/Inventory/RefundCases mocked)
// ---------------------------------------------------------------------------

type Tx = {
  $queryRaw: jest.Mock;
  returnRequest: {
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  returnItem: { create: jest.Mock };
  returnItemAllocation: { create: jest.Mock; update: jest.Mock };
  returnEvent: { create: jest.Mock };
  returnReceipt: { create: jest.Mock };
  returnReceiptLine: { findMany: jest.Mock };
  returnInspection: { create: jest.Mock };
  returnInspectionLine: { findMany: jest.Mock };
  shipmentLine: { findMany: jest.Mock };
  refundCase: { findMany: jest.Mock };
};

function buildTx(): Tx {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    returnRequest: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    returnItem: { create: jest.fn() },
    returnItemAllocation: { create: jest.fn(), update: jest.fn() },
    returnEvent: { create: jest.fn().mockResolvedValue({}) },
    returnReceipt: { create: jest.fn() },
    returnReceiptLine: { findMany: jest.fn().mockResolvedValue([]) },
    returnInspection: { create: jest.fn() },
    returnInspectionLine: { findMany: jest.fn().mockResolvedValue([]) },
    shipmentLine: { findMany: jest.fn().mockResolvedValue([]) },
    refundCase: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function buildPrisma(): {
  returnRequest: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
  };
  returnReceipt: { findUnique: jest.Mock };
  returnInspection: { findUnique: jest.Mock };
  returnEvent: { create: jest.Mock };
  order: { findUnique: jest.Mock };
  orderItem: { findMany: jest.Mock };
  shipmentLine: { findMany: jest.Mock };
  refundCase: { findMany: jest.Mock };
  $transaction: jest.Mock;
  tx: Tx;
} {
  const tx = buildTx();
  return {
    returnRequest: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    returnReceipt: { findUnique: jest.fn() },
    returnInspection: { findUnique: jest.fn() },
    returnEvent: { create: jest.fn().mockResolvedValue({}) },
    order: { findUnique: jest.fn() },
    orderItem: { findMany: jest.fn() },
    shipmentLine: { findMany: jest.fn().mockResolvedValue([]) },
    refundCase: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(
      (arg: ((client: Tx) => unknown) | Promise<unknown>[]) =>
        Array.isArray(arg) ? Promise.all(arg) : arg(tx),
    ),
    tx,
  };
}

describe('ReturnsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let inventoryService: { receiveReturnedStock: jest.Mock };
  let numberingService: { nextReturnRmaNumber: jest.Mock };
  let refundCasesService: {
    createCase: jest.Mock;
    prepareCase: jest.Mock;
    processPending: jest.Mock;
    retry: jest.Mock;
  };
  let service: ReturnsService;

  beforeEach(() => {
    prisma = buildPrisma();
    inventoryService = {
      receiveReturnedStock: jest.fn().mockResolvedValue({}),
    };
    numberingService = {
      nextReturnRmaNumber: jest.fn().mockResolvedValue('RMA-2026-000001'),
    };
    refundCasesService = {
      createCase: jest.fn(),
      prepareCase: jest.fn(),
      processPending: jest.fn(),
      retry: jest.fn(),
    };
    service = new ReturnsService(
      prisma as unknown as PrismaService,
      inventoryService as unknown as InventoryService,
      numberingService as unknown as NumberingService,
      refundCasesService as unknown as RefundCasesService,
    );
  });

  describe('cancelReturn', () => {
    it('cancels a REQUESTED return and records an event', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        status: ReturnStatus.REQUESTED,
      });
      prisma.tx.returnRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.tx.returnRequest.findUniqueOrThrow.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        status: ReturnStatus.CANCELLED,
      });

      await service.cancelReturn('u1', 'r1', 0);

      expect(prisma.tx.returnRequest.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'r1',
          userId: 'u1',
          status: ReturnStatus.REQUESTED,
          version: 0,
        },
        data: { status: ReturnStatus.CANCELLED, version: { increment: 1 } },
      });
      expect(prisma.tx.returnEvent.create).toHaveBeenCalled();
    });

    it('throws ConflictException on a stale version', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        status: ReturnStatus.REQUESTED,
      });
      prisma.tx.returnRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.cancelReturn('u1', 'r1', 0)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException (not ForbiddenException) for a return owned by another user', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'someone-else',
        status: ReturnStatus.REQUESTED,
      });

      await expect(service.cancelReturn('u1', 'r1', 0)).rejects.toThrow(
        'Return request not found',
      );
    });
  });

  describe('approve / reject transitions', () => {
    it('rejects approving a return that is not REQUESTED', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: 'r1',
        status: ReturnStatus.APPROVED,
      });

      await expect(
        service.approve('r1', { warehouseId: 'w1', version: 0 }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('approves a REQUESTED return, assigning an RMA number', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: 'r1',
        status: ReturnStatus.REQUESTED,
      });
      prisma.tx.returnRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.tx.returnRequest.findUniqueOrThrow.mockResolvedValue({ id: 'r1' });

      await service.approve('r1', { warehouseId: 'w1', version: 0 }, 'admin-1');

      expect(numberingService.nextReturnRmaNumber).toHaveBeenCalled();
      expect(prisma.tx.returnRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ReturnStatus.APPROVED,
            rmaNumber: 'RMA-2026-000001',
          }) as object,
        }),
      );
    });

    it('rejects rejecting a return that is not REQUESTED', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: 'r1',
        status: ReturnStatus.RECEIVING,
      });

      await expect(
        service.reject('r1', { rejectionReason: 'bad', version: 0 }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('postReceipt', () => {
    function returnRequestFixture(
      overrides: Partial<Record<string, unknown>> = {},
    ): Record<string, unknown> {
      return {
        id: 'r1',
        status: ReturnStatus.APPROVED,
        warehouseId: 'w1',
        assignedStaffId: 'staff-1',
        items: [
          {
            id: 'ri1',
            quantity: 2,
            allocations: [{ id: 'alloc-1', quantity: 2, releasedQuantity: 0 }],
          },
        ],
        ...overrides,
      };
    }

    it('rejects a staff member who is not assigned to the return', async () => {
      prisma.returnReceipt.findUnique.mockResolvedValue(null);
      prisma.tx.returnRequest.findUnique.mockResolvedValue(
        returnRequestFixture(),
      );

      await expect(
        service.postReceipt(
          'r1',
          { warehouseId: 'w1', lines: [{ returnItemId: 'ri1', quantity: 1 }] },
          'someone-else',
          Role.STAFF,
          'key-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('moves APPROVED -> RECEIVING on a non-closing partial receipt', async () => {
      prisma.returnReceipt.findUnique.mockResolvedValue(null);
      prisma.tx.returnRequest.findUnique.mockResolvedValue(
        returnRequestFixture(),
      );
      prisma.tx.returnReceipt.create.mockResolvedValue({ id: 'rec1' });
      prisma.tx.returnRequest.findUniqueOrThrow.mockResolvedValue({ id: 'r1' });

      await service.postReceipt(
        'r1',
        { warehouseId: 'w1', lines: [{ returnItemId: 'ri1', quantity: 1 }] },
        'staff-1',
        Role.STAFF,
        'key-1',
      );

      expect(prisma.tx.returnRequest.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: ReturnStatus.RECEIVING, version: { increment: 1 } },
      });
    });

    it('moves status to RECEIVED and releases unreceived quantity on a closing receipt', async () => {
      prisma.returnReceipt.findUnique.mockResolvedValue(null);
      prisma.tx.returnRequest.findUnique.mockResolvedValue(
        returnRequestFixture({ status: ReturnStatus.RECEIVING }),
      );
      prisma.tx.returnReceipt.create.mockResolvedValue({ id: 'rec1' });
      prisma.tx.returnReceiptLine.findMany.mockResolvedValue([
        { returnItemId: 'ri1', quantity: 1 },
      ]);
      prisma.tx.returnRequest.findUniqueOrThrow.mockResolvedValue({ id: 'r1' });

      await service.postReceipt(
        'r1',
        {
          warehouseId: 'w1',
          lines: [{ returnItemId: 'ri1', quantity: 1 }],
          isClosing: true,
        },
        'staff-1',
        Role.STAFF,
        'key-1',
      );

      const calls = prisma.tx.returnEvent.create.mock.calls as {
        data: { type: string };
      }[][];
      const releaseEvent = calls.find(
        ([call]) => call?.data.type === 'CLOSING_RECEIPT_RELEASED_QUANTITY',
      );
      expect(releaseEvent).toBeDefined();
      expect(prisma.tx.returnItemAllocation.update).toHaveBeenCalledWith({
        where: { id: 'alloc-1' },
        data: { releasedQuantity: { increment: 1 } },
      });
      expect(prisma.tx.returnRequest.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: ReturnStatus.RECEIVED, version: { increment: 1 } },
      });
    });

    it('rejects a receipt whose warehouse does not match the return', async () => {
      prisma.returnReceipt.findUnique.mockResolvedValue(null);
      prisma.tx.returnRequest.findUnique.mockResolvedValue(
        returnRequestFixture(),
      );

      await expect(
        service.postReceipt(
          'r1',
          {
            warehouseId: 'wrong-warehouse',
            lines: [{ returnItemId: 'ri1', quantity: 1 }],
          },
          'staff-1',
          Role.STAFF,
          'key-1',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('postInspection', () => {
    function returnRequestFixture(
      overrides: Partial<Record<string, unknown>> = {},
    ): Record<string, unknown> {
      return {
        id: 'r1',
        status: ReturnStatus.RECEIVED,
        warehouseId: 'w1',
        assignedStaffId: 'staff-1',
        rmaNumber: 'RMA-1',
        items: [
          {
            id: 'ri1',
            orderItemId: 'oi1',
            quantity: 2,
            unitAmount: 1000,
            currency: 'ZMW',
            orderItem: {
              id: 'oi1',
              sellerOrderId: 'so1',
              offer: { variantId: 'var-1' },
            },
          },
        ],
        ...overrides,
      };
    }

    beforeEach(() => {
      prisma.returnInspection.findUnique.mockResolvedValue(null);
      prisma.tx.returnReceiptLine.findMany.mockResolvedValue([
        { returnItemId: 'ri1', quantity: 2 },
      ]);
      prisma.tx.returnInspection.create.mockImplementation(
        ({
          data,
        }: {
          data: { lines: { create: Record<string, unknown>[] } };
        }) =>
          Promise.resolve({
            id: 'insp-1',
            lines: data.lines.create.map((line, index) => ({
              id: `line-${index}`,
              ...line,
            })),
          }),
      );
      prisma.tx.returnRequest.findUniqueOrThrow.mockResolvedValue({ id: 'r1' });
    });

    it('requires a disposition when acceptedQuantity > 0', async () => {
      prisma.tx.returnRequest.findUnique.mockResolvedValue(
        returnRequestFixture(),
      );

      await expect(
        service.postInspection(
          'r1',
          {
            lines: [
              {
                returnItemId: 'ri1',
                warehouseId: 'w1',
                acceptedQuantity: 2,
                rejectedQuantity: 0,
              },
            ],
          },
          'staff-1',
          Role.STAFF,
          'key-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires a rejectionReason when rejectedQuantity > 0', async () => {
      prisma.tx.returnRequest.findUnique.mockResolvedValue(
        returnRequestFixture(),
      );

      await expect(
        service.postInspection(
          'r1',
          {
            lines: [
              {
                returnItemId: 'ri1',
                warehouseId: 'w1',
                acceptedQuantity: 0,
                rejectedQuantity: 2,
              },
            ],
          },
          'staff-1',
          Role.STAFF,
          'key-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects accepted+rejected exceeding the received quantity', async () => {
      prisma.tx.returnRequest.findUnique.mockResolvedValue(
        returnRequestFixture(),
      );

      await expect(
        service.postInspection(
          'r1',
          {
            lines: [
              {
                returnItemId: 'ri1',
                warehouseId: 'w1',
                acceptedQuantity: 2,
                disposition: ReturnDisposition.RESTOCK,
                rejectedQuantity: 1,
                rejectionReason: 'damaged in transit',
              },
            ],
          },
          'staff-1',
          Role.STAFF,
          'key-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('calls receiveReturnedStock only for a RESTOCK line, never for other dispositions', async () => {
      prisma.tx.returnRequest.findUnique.mockResolvedValue(
        returnRequestFixture(),
      );

      await service.postInspection(
        'r1',
        {
          lines: [
            {
              returnItemId: 'ri1',
              warehouseId: 'w1',
              acceptedQuantity: 2,
              disposition: ReturnDisposition.RESTOCK,
              rejectedQuantity: 0,
            },
          ],
        },
        'staff-1',
        Role.STAFF,
        'key-1',
      );

      expect(inventoryService.receiveReturnedStock).toHaveBeenCalledWith(
        prisma.tx,
        'w1',
        'var-1',
        2,
        { referenceType: 'return_inspection_line', referenceId: 'line-0' },
      );

      inventoryService.receiveReturnedStock.mockClear();

      await service.postInspection(
        'r1',
        {
          lines: [
            {
              returnItemId: 'ri1',
              warehouseId: 'w1',
              acceptedQuantity: 2,
              disposition: ReturnDisposition.QUARANTINE,
              rejectedQuantity: 0,
            },
          ],
        },
        'staff-1',
        Role.STAFF,
        'key-2',
      );

      expect(inventoryService.receiveReturnedStock).not.toHaveBeenCalled();
    });

    it('moves RECEIVED -> INSPECTING on the first inspection', async () => {
      prisma.tx.returnRequest.findUnique.mockResolvedValue(
        returnRequestFixture(),
      );

      await service.postInspection(
        'r1',
        {
          lines: [
            {
              returnItemId: 'ri1',
              warehouseId: 'w1',
              acceptedQuantity: 2,
              disposition: ReturnDisposition.RESTOCK,
              rejectedQuantity: 0,
            },
          ],
        },
        'staff-1',
        Role.STAFF,
        'key-1',
      );

      expect(prisma.tx.returnRequest.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: ReturnStatus.INSPECTING, version: { increment: 1 } },
      });
    });

    describe('final inspection', () => {
      it('rejects finalizing while received quantity is left unaccounted for', async () => {
        prisma.tx.returnRequest.findUnique.mockResolvedValue(
          returnRequestFixture({ status: ReturnStatus.INSPECTING }),
        );
        prisma.tx.returnRequest.findUniqueOrThrow.mockResolvedValue(
          returnRequestFixture({ status: ReturnStatus.INSPECTING }),
        );
        // Pre-create validation sees no prior inspection lines (first call);
        // finalize's post-create completeness check sees only 1 of the 2
        // received units dispositioned (second call onward).
        prisma.tx.returnInspectionLine.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValue([
            { returnItemId: 'ri1', acceptedQuantity: 1, rejectedQuantity: 0 },
          ]);

        await expect(
          service.postInspection(
            'r1',
            {
              isFinal: true,
              lines: [
                {
                  returnItemId: 'ri1',
                  warehouseId: 'w1',
                  acceptedQuantity: 1,
                  disposition: ReturnDisposition.RESTOCK,
                  rejectedQuantity: 0,
                },
              ],
            },
            'staff-1',
            Role.STAFF,
            'key-1',
          ),
        ).rejects.toThrow(ConflictException);
      });

      it('closes with no refund when every unit is rejected', async () => {
        prisma.tx.returnRequest.findUnique.mockResolvedValue(
          returnRequestFixture({ status: ReturnStatus.INSPECTING }),
        );
        prisma.tx.returnRequest.findUniqueOrThrow.mockResolvedValue({
          ...returnRequestFixture({ status: ReturnStatus.INSPECTING }),
        });
        prisma.tx.returnInspectionLine.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValue([
            { returnItemId: 'ri1', acceptedQuantity: 0, rejectedQuantity: 2 },
          ]);

        await service.postInspection(
          'r1',
          {
            isFinal: true,
            lines: [
              {
                returnItemId: 'ri1',
                warehouseId: 'w1',
                acceptedQuantity: 0,
                rejectedQuantity: 2,
                rejectionReason: 'damaged beyond repair',
              },
            ],
          },
          'admin-1',
          Role.ADMIN,
          'key-1',
        );

        expect(prisma.tx.returnRequest.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: ReturnStatus.CLOSED_NO_REFUND,
            }) as object,
          }),
        );
        expect(refundCasesService.createCase).not.toHaveBeenCalled();
      });

      it('creates one refund case per seller order and sets REFUND_PENDING', async () => {
        prisma.tx.returnRequest.findUnique.mockResolvedValue(
          returnRequestFixture({ status: ReturnStatus.INSPECTING }),
        );
        prisma.tx.returnRequest.findUniqueOrThrow.mockResolvedValue({
          ...returnRequestFixture({ status: ReturnStatus.INSPECTING }),
        });
        refundCasesService.prepareCase.mockResolvedValue({
          created: true,
          refundCase: { id: 'case-1', status: RefundCaseStatus.PENDING },
        });
        prisma.tx.returnInspectionLine.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValue([
            { returnItemId: 'ri1', acceptedQuantity: 2, rejectedQuantity: 0 },
          ]);

        await service.postInspection(
          'r1',
          {
            isFinal: true,
            lines: [
              {
                returnItemId: 'ri1',
                warehouseId: 'w1',
                acceptedQuantity: 2,
                disposition: ReturnDisposition.RESTOCK,
                rejectedQuantity: 0,
              },
            ],
          },
          'admin-1',
          Role.ADMIN,
          'key-1',
        );

        expect(refundCasesService.prepareCase).toHaveBeenCalledWith(
          expect.objectContaining({
            sellerOrderId: 'so1',
            source: RefundCaseSource.RETURN,
            returnRequestId: 'r1',
            amount: 2000,
            shippingAmount: 0,
            idempotencyKey: 'return-finalize:r1:so1',
          }),
          prisma.tx,
        );
        expect(prisma.tx.returnRequest.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: ReturnStatus.REFUND_PENDING,
            }) as object,
          }),
        );
      });
    });
  });
});
