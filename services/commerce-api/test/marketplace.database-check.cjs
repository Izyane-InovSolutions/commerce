// After migrations/build: node --env-file=.env test/marketplace.database-check.cjs
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const request = require('supertest');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/database/prisma.service');
const { MarketplaceOffersService } = require('../dist/modules/offers/marketplace-offers.service');
const { SellersService } = require('../dist/modules/sellers/sellers.service');
const { InventoryService } = require('../dist/modules/inventory/inventory.service');

async function run() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  const prisma = app.get(PrismaService);
  const offers = app.get(MarketplaceOffersService);
  const sellers = app.get(SellersService);
  const inventory = app.get(InventoryService);
  const jwt = app.get(JwtService);
  const userIds = [randomUUID(), randomUUID(), randomUUID()];
  const sellerIds = [randomUUID(), randomUUID()];
  const roles = ['SELLER', 'SELLER', 'ADMIN'];
  const productId = randomUUID(), variantId = randomUUID(), retailId = randomUUID();
  const warehouseId = randomUUID();
  const slug = `shop-${sellerIds[0]}`;
  const server = app.getHttpServer();
  const auth = index => jwt.sign({ sub: userIds[index], role: roles[index], sid: randomUUID() });
  const body = { variantId, sellerSku: 'SKU-A', listingTitle: 'Independent listing', condition: 'NEW', stockSource: 'SELLER', fulfillmentMode: 'SELLER' };
  let offer;
  try {
    await prisma.user.createMany({ data: userIds.map((id, i) => ({ id, email: `marketplace-check-${id}@example.test`, passwordHash: 'not-a-login-password', role: roles[i] })) });
    await prisma.seller.createMany({ data: sellerIds.map((id, i) => ({ id, ownerUserId: userIds[i], businessName: 'Private legal business', registrationNumber: 'PRIVATE-REG', country: 'ZM', businessAddress: 'PRIVATE-ADDRESS', contactEmail: 'private@example.test', status: i ? 'APPROVED' : 'PENDING' })) });
    await prisma.product.create({ data: { id: productId, name: 'Canonical product', slug: `product-${productId}`, status: 'PUBLISHED' } });
    await prisma.productVariant.create({ data: { id: variantId, productId, skuCode: `canonical-${variantId}`, status: 'PUBLISHED' } });
    await prisma.offer.create({ data: { id: retailId, variantId, status: 'PUBLISHED', prices: { create: { amount: 3000, currency: 'USD' } } } });
    await prisma.warehouse.create({ data: { id: warehouseId, name: 'Test stock', code: warehouseId } });
    await prisma.inventoryRecord.create({ data: { warehouseId, variantId, onHand: 100 } });

    await request(server).post('/api/v1/sellers/me/offers').auth(auth(0), { type: 'bearer' }).send(body).expect(403);
    await prisma.seller.update({ where: { id: sellerIds[0] }, data: { status: 'APPROVED' } });
    const profile = { version: 0, storefrontSlug: slug, displayName: 'Public shop', description: 'Our public introduction' };
    await request(server).put('/api/v1/sellers/me/storefront').auth(auth(0), { type: 'bearer' }).send(profile).expect(200);
    await request(server).put('/api/v1/sellers/me/storefront').auth(auth(1), { type: 'bearer' }).send(profile).expect(409);
    await request(server).put('/api/v1/sellers/me/storefront').auth(auth(0), { type: 'bearer' }).send(profile).expect(409);
    const storefront = await request(server).get(`/api/v1/storefronts/${slug}`).expect(200);
    assert.deepEqual(Object.keys(storefront.body.data).sort(), ['description', 'displayName', 'id', 'storefrontSlug']);

    await request(server).post('/api/v1/sellers/me/offers').auth(auth(0), { type: 'bearer' }).send({ ...body, sellerId: sellerIds[1] }).expect(400);
    offer = (await request(server).post('/api/v1/sellers/me/offers').auth(auth(0), { type: 'bearer' }).send(body).expect(201)).body.data;
    assert.equal(offer.sellerId, sellerIds[0]);
    await request(server).get(`/api/v1/catalog/offers/${offer.id}`).expect(404);
    await request(server).get(`/api/v1/sellers/me/offers/${offer.id}`).auth(auth(1), { type: 'bearer' }).expect(404);
    await request(server).patch(`/api/v1/sellers/me/offers/${offer.id}`).auth(auth(1), { type: 'bearer' }).send({ sellerSku: 'TAKEN', listingTitle: 'Wrong owner', condition: 'NEW', stockSource: 'SELLER', fulfillmentMode: 'SELLER', version: 0 }).expect(404);
    await request(server).post('/api/v1/sellers/me/offers').auth(auth(0), { type: 'bearer' }).send(body).expect(409);
    await request(server).patch(`/api/v1/sellers/me/offers/${offer.id}/status`).auth(auth(0), { type: 'bearer' }).send({ version: 0, status: 'PUBLISHED' }).expect(400);
    offer = await offers.price(userIds[0], offer.id, { version: 0, amount: 2500, currency: 'USD' });
    offer = await offers.status(userIds[0], offer.id, { version: offer.version, status: 'PUBLISHED' });
    const emptyInventory = (await request(server).get('/api/v1/sellers/me/inventory').auth(auth(0), { type: 'bearer' }).expect(200)).body.data;
    assert.deepEqual(emptyInventory.find(item => item.offerId === offer.id), {
      id: null,
      offerId: offer.id,
      variantId,
      sellerSku: body.sellerSku,
      listingTitle: body.listingTitle,
      onHand: 0,
      reserved: 0,
      available: 0,
      version: 0,
      updatedAt: null,
    });
    await request(server).put(`/api/v1/sellers/me/inventory/${offer.id}`).auth(auth(1), { type: 'bearer' }).send({ quantity: 5, version: 0 }).expect(404);
    let sellerInventory = (await request(server).put(`/api/v1/sellers/me/inventory/${offer.id}`).auth(auth(0), { type: 'bearer' }).send({ quantity: 5, version: 0, note: 'Initial count' }).expect(200)).body.data;
    assert.equal(sellerInventory.available, 5);
    sellerInventory = (await request(server).patch('/api/v1/sellers/me/inventory/bulk').auth(auth(0), { type: 'bearer' }).send({ items: [{ offerId: offer.id, quantity: 8, version: sellerInventory.version }] }).expect(200)).body.data[0];
    assert.equal(sellerInventory.onHand, 8);
    const movements = (await request(server).get(`/api/v1/sellers/me/inventory/${offer.id}/movements`).auth(auth(0), { type: 'bearer' }).expect(200)).body.data;
    assert.deepEqual(movements.map(item => item.quantity).sort((a, b) => a - b), [3, 5]);
    const reservations = await Promise.allSettled([
      inventory.reserveOffer(offer.id, 6, { ttlSeconds: 60 }),
      inventory.reserveOffer(offer.id, 6, { ttlSeconds: 60 }),
    ]);
    assert.equal(reservations.filter(item => item.status === 'fulfilled').length, 1);
    await inventory.release(reservations.find(item => item.status === 'fulfilled').value.id);
    const comparison = (await request(server).get(`/api/v1/catalog/variants/${variantId}/offers`).expect(200)).body.data;
    assert.equal(comparison.total, 2);
    assert.equal(comparison.items.find(item => item.id === offer.id).checkoutSupported, true);
    assert.equal(comparison.items.find(item => item.id === retailId).isFirstParty, true);
    assert.ok(!JSON.stringify(comparison).includes('PRIVATE-'));
    const catalogue = (await request(server).get(`/api/v1/catalog/products/product-${productId}`).expect(200)).body.data;
    assert.deepEqual(catalogue.variants[0].offers.map(item => item.id), [retailId]);
    await request(server).post('/api/v1/cart/items').auth(auth(0), { type: 'bearer' }).send({ offerId: offer.id, quantity: 1 }).expect(201);
    assert.equal(await prisma.reservation.count({ where: { inventoryRecord: { variantId }, status: 'ACTIVE' } }), 0);
    await request(server).patch(`/api/v1/admin/catalog/offers/${offer.id}/status`).auth(auth(2), { type: 'bearer' }).send({ status: 'PUBLISHED' }).expect(400);
    await request(server).patch(`/api/v1/admin/catalog/products/${productId}`).auth(auth(0), { type: 'bearer' }).send({ name: 'Hijacked' }).expect(403);

    const writes = await Promise.allSettled([
      offers.price(userIds[0], offer.id, { version: offer.version, amount: 2600, currency: 'USD' }),
      offers.price(userIds[0], offer.id, { version: offer.version, amount: 2700, currency: 'USD' }),
    ]);
    assert.equal(writes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(await prisma.price.count({ where: { offerId: offer.id, endsAt: null } }), 1);
    let seller = await sellers.mine(userIds[0]);
    await sellers.review(userIds[2], seller.id, 'SUSPENDED', { version: seller.version, reason: 'Test suspension' });
    await request(server).get(`/api/v1/storefronts/${slug}`).expect(404);
    await request(server).get(`/api/v1/catalog/offers/${offer.id}`).expect(404);
    await assert.rejects(() => offers.price(userIds[0], offer.id, { version: 3, amount: 2800, currency: 'USD' }), { status: 403 });
    assert.equal((await offers.compare(variantId, { page: 1, limit: 20 })).total, 1);

    // Restore only the fixture to test variant visibility and lifecycle separately.
    await prisma.seller.update({ where: { id: sellerIds[0] }, data: { status: 'APPROVED' } });
    await prisma.productVariant.update({ where: { id: variantId }, data: { status: 'DRAFT' } });
    await request(server).get(`/api/v1/catalog/offers/${offer.id}`).expect(404);
    await prisma.productVariant.update({ where: { id: variantId }, data: { status: 'PUBLISHED' } });
    offer = await offers.findOwn(userIds[0], offer.id);
    offer = await offers.status(userIds[0], offer.id, { version: offer.version, status: 'DRAFT' });
    await request(server).get(`/api/v1/catalog/offers/${offer.id}`).expect(404);
    offer = await offers.status(userIds[0], offer.id, { version: offer.version, status: 'ARCHIVED' });
    await assert.rejects(() => offers.status(userIds[0], offer.id, { version: offer.version, status: 'PUBLISHED' }), { status: 409 });
    assert.ok(await prisma.auditEvent.count({ where: { targetId: offer.id, action: 'offer.status_changed' } }) >= 3);
    console.log('Marketplace database/HTTP checks passed: storefront privacy, offer ownership/publishing, seller inventory, bulk audit history, concurrent reservations, suspension, archive, and retail isolation.');
  } finally {
    await prisma.offer.deleteMany({ where: { variantId } });
    await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.seller.deleteMany({ where: { id: { in: sellerIds } } });
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
