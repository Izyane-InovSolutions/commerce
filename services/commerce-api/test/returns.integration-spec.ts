import { randomUUID } from 'node:crypto';

import { ConflictException } from '@nestjs/common';
import {
  OrderStatus,
  ReturnReasonCode,
  ReturnStatus,
  Role,
} from '@prisma/client';

import { PrismaService } from '../src/database/prisma.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { RefundCasesService } from '../src/modules/payments/refund-cases.service';
import { ReturnsService } from '../src/modules/returns/returns.service';
import { NumberingService } from '../src/common/numbering/numbering.service';

describe('Returns integrity (integration, real Postgres)', () => {
  const prisma = new PrismaService();
  const suffix = randomUUID().slice(0, 8);
  const inventory = {} as InventoryService;
  const numbering = {} as NumberingService;
  const refundCases = {} as RefundCasesService;
  const service = new ReturnsService(prisma, inventory, numbering, refundCases);

  let userId: string;
  let orderId: string;
  let orderItemId: string;
  let warehouseId: string;
  let productId: string;
  let returnRequestId: string;
  let returnItemId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: {
        email: `returns-${suffix}@example.test`,
        passwordHash: 'integration',
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: { name: `Returns ${suffix}`, slug: `returns-${suffix}` },
    });
    productId = product.id;
    const variant = await prisma.productVariant.create({
      data: { productId, skuCode: `RET-${suffix}` },
    });
    const offer = await prisma.offer.create({
      data: { variantId: variant.id },
    });
    const warehouse = await prisma.warehouse.create({
      data: { name: `Returns ${suffix}`, code: `RET-${suffix}` },
    });
    warehouseId = warehouse.id;
    const order = await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.PAID,
        currency: 'ZMW',
        subtotal: 2_000,
        total: 2_000,
        shippingAddress: {},
        sellerOrders: {
          create: {
            status: OrderStatus.PAID,
            currency: 'ZMW',
            subtotal: 2_000,
            total: 2_000,
          },
        },
      },
      include: { sellerOrders: true },
    });
    orderId = order.id;
    const item = await prisma.orderItem.create({
      data: {
        orderId,
        sellerOrderId: order.sellerOrders[0]!.id,
        offerId: offer.id,
        quantity: 2,
        unitAmount: 1_000,
        lineTotal: 2_000,
        currency: 'ZMW',
      },
    });
    orderItemId = item.id;
    const request = await prisma.returnRequest.create({
      data: { orderId, userId, status: ReturnStatus.APPROVED, warehouseId },
    });
    returnRequestId = request.id;
    const returnItem = await prisma.returnItem.create({
      data: {
        returnRequestId,
        orderItemId,
        quantity: 2,
        reasonCode: ReturnReasonCode.DAMAGED,
        unitAmount: 1_000,
        currency: 'ZMW',
        returnWindowDays: 30,
        deliveredAt: new Date(),
        eligibleUntil: new Date(Date.now() + 86_400_000),
      },
    });
    returnItemId = returnItem.id;
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('rejects cumulative receiving above the requested quantity', async () => {
    await expect(
      service.postReceipt(
        returnRequestId,
        { warehouseId, lines: [{ returnItemId, quantity: 3 }] },
        userId,
        Role.ADMIN,
        randomUUID(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('posts once, safely replays identical input, and rejects changed input', async () => {
    const key = randomUUID();
    const input = { warehouseId, lines: [{ returnItemId, quantity: 1 }] };
    const first = await service.postReceipt(
      returnRequestId,
      input,
      userId,
      Role.ADMIN,
      key,
    );
    const replay = await service.postReceipt(
      returnRequestId,
      input,
      userId,
      Role.ADMIN,
      key,
    );
    expect(replay.id).toBe(first.id);
    await expect(
      service.postReceipt(
        returnRequestId,
        { warehouseId, lines: [{ returnItemId, quantity: 2 }] },
        userId,
        Role.ADMIN,
        key,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      await prisma.returnReceipt.count({ where: { returnRequestId } }),
    ).toBe(1);
  });

  it('enforces one return item per order item at the database boundary', async () => {
    await expect(
      prisma.returnItem.create({
        data: {
          returnRequestId,
          orderItemId,
          quantity: 1,
          reasonCode: ReturnReasonCode.OTHER,
          unitAmount: 1_000,
          currency: 'ZMW',
          returnWindowDays: 30,
          deliveredAt: new Date(),
          eligibleUntil: new Date(Date.now() + 86_400_000),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
