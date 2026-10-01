import { randomUUID } from 'node:crypto';

import { ConflictException, INestApplication } from '@nestjs/common';
import type {
  Offer,
  Order,
  OrderItem,
  Prisma,
  Product,
  ProductVariant,
  SellerOrder,
  User,
} from '@prisma/client';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { OffersService } from '../src/modules/offers/offers.service';
import { ProductsService } from '../src/modules/products/products.service';

type CatalogFixture = {
  product: Product;
  variant: ProductVariant;
  offer: Offer;
};
type OrderFixture = {
  user: User;
  order: Order;
  sellerOrder: SellerOrder;
  offerId: string;
};

describe('Catalog deletion history (integration, real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let offers: OffersService;
  let products: ProductsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    offers = app.get(OffersService);
    products = app.get(ProductsService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function catalog(): Promise<CatalogFixture> {
    const suffix = randomUUID().slice(0, 8);
    const product = await prisma.product.create({
      data: { name: `Deletion ${suffix}`, slug: `deletion-${suffix}` },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, skuCode: `DELETE-${suffix}` },
    });
    const offer = await prisma.offer.create({
      data: { variantId: variant.id },
    });
    return { product, variant, offer };
  }

  async function customerOrder(offerId: string): Promise<OrderFixture> {
    const suffix = randomUUID().slice(0, 8);
    const user = await prisma.user.create({
      data: {
        email: `deletion-${suffix}@example.test`,
        passwordHash: 'x',
        emailVerifiedAt: new Date(),
      },
    });
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        currency: 'USD',
        subtotal: 100,
        total: 100,
        shippingAddress: {},
      },
    });
    const sellerOrder = await prisma.sellerOrder.create({
      data: {
        orderId: order.id,
        currency: 'USD',
        subtotal: 100,
        total: 100,
      },
    });
    return { user, order, sellerOrder, offerId };
  }

  async function addOrderItem(
    tx: Pick<Prisma.TransactionClient, 'orderItem'>,
    fixture: OrderFixture,
  ): Promise<OrderItem> {
    return tx.orderItem.create({
      data: {
        orderId: fixture.order.id,
        sellerOrderId: fixture.sellerOrder.id,
        offerId: fixture.offerId,
        quantity: 1,
        unitAmount: 100,
        currency: 'USD',
        lineTotal: 100,
      },
    });
  }

  async function removeOrder(fixture: OrderFixture): Promise<void> {
    await prisma.order.delete({ where: { id: fixture.order.id } });
    await prisma.user.delete({ where: { id: fixture.user.id } });
  }

  it('deletes an unused offer and its empty stock row', async () => {
    const fixture = await catalog();
    const stock = await prisma.inventoryRecord.create({
      data: {
        variantId: fixture.variant.id,
        offerId: fixture.offer.id,
      },
    });

    await offers.remove(fixture.offer.id);

    await expect(
      prisma.inventoryRecord.findUnique({ where: { id: stock.id } }),
    ).resolves.toBeNull();
    await products.remove(fixture.product.id);
  });

  it('deletes an unused variant', async () => {
    const fixture = await catalog();
    await offers.remove(fixture.offer.id);

    await products.removeVariant(fixture.product.id, fixture.variant.id);

    await expect(
      prisma.productVariant.findUnique({ where: { id: fixture.variant.id } }),
    ).resolves.toBeNull();
    await prisma.product.delete({ where: { id: fixture.product.id } });
  });

  it('keeps an order item and returns conflict when its offer is deleted', async () => {
    const fixture = await catalog();
    const order = await customerOrder(fixture.offer.id);
    const item = await addOrderItem(prisma, order);

    await expect(
      prisma.offer.delete({ where: { id: fixture.offer.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(offers.remove(fixture.offer.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      prisma.orderItem.findUnique({ where: { id: item.id } }),
    ).resolves.toMatchObject({ offerId: fixture.offer.id });

    await removeOrder(order);
    await prisma.product.delete({ where: { id: fixture.product.id } });
  });

  it('keeps stock movement history through the product deletion chain', async () => {
    const fixture = await catalog();
    const warehouse = await prisma.warehouse.create({
      data: { name: `History ${fixture.offer.id}`, code: `H-${randomUUID()}` },
    });
    const stock = await prisma.inventoryRecord.create({
      data: {
        warehouseId: warehouse.id,
        variantId: fixture.variant.id,
        onHand: 1,
      },
    });
    const movement = await prisma.inventoryMovement.create({
      data: {
        inventoryRecordId: stock.id,
        type: 'RECEIPT',
        quantity: 1,
      },
    });

    await expect(
      prisma.inventoryRecord.delete({ where: { id: stock.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(products.remove(fixture.product.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      prisma.inventoryMovement.findUnique({ where: { id: movement.id } }),
    ).resolves.toMatchObject({ inventoryRecordId: stock.id });

    await prisma.inventoryMovement.delete({ where: { id: movement.id } });
    await prisma.inventoryRecord.delete({ where: { id: stock.id } });
    await prisma.warehouse.delete({ where: { id: warehouse.id } });
    await prisma.product.delete({ where: { id: fixture.product.id } });
  });

  it('keeps a reservation and returns conflict when its offer is deleted', async () => {
    const fixture = await catalog();
    const stock = await prisma.inventoryRecord.create({
      data: {
        variantId: fixture.variant.id,
        offerId: fixture.offer.id,
        onHand: 1,
        reserved: 1,
      },
    });
    const reservation = await prisma.reservation.create({
      data: {
        inventoryRecordId: stock.id,
        quantity: 1,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await expect(
      prisma.inventoryRecord.delete({ where: { id: stock.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(offers.remove(fixture.offer.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      prisma.reservation.findUnique({ where: { id: reservation.id } }),
    ).resolves.toMatchObject({ inventoryRecordId: stock.id });

    await prisma.reservation.delete({ where: { id: reservation.id } });
    await prisma.inventoryRecord.delete({ where: { id: stock.id } });
    await prisma.product.delete({ where: { id: fixture.product.id } });
  });

  it('serializes a concurrent order insertion before deciding deletion', async () => {
    const fixture = await catalog();
    const order = await customerOrder(fixture.offer.id);
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inserted!: () => void;
    const insertionStarted = new Promise<void>((resolve) => {
      inserted = resolve;
    });

    const insertion = prisma.$transaction(async (tx) => {
      await addOrderItem(tx, order);
      inserted();
      await released;
    });
    await insertionStarted;
    const deletion = offers.remove(fixture.offer.id);
    release();
    await insertion;

    await expect(deletion).rejects.toBeInstanceOf(ConflictException);
    await expect(
      prisma.orderItem.count({ where: { offerId: fixture.offer.id } }),
    ).resolves.toBe(1);

    await removeOrder(order);
    await prisma.product.delete({ where: { id: fixture.product.id } });
  });
});
