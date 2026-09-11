// Run after build: node --env-file=.env test/sellers.database-check.cjs
// Uses the configured local database and removes only records created here.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const request = require('supertest');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/database/prisma.service');
const { SellersService } = require('../dist/modules/sellers/sellers.service');

async function run() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  const prisma = app.get(PrismaService);
  const sellers = app.get(SellersService);
  const jwt = app.get(JwtService);
  const userIds = [randomUUID(), randomUUID(), randomUUID()];
  const documentId = randomUUID();
  const roles = ['CUSTOMER', 'ADMIN', 'CUSTOMER'];
  const token = index => jwt.sign({ sub: userIds[index], role: roles[index], sid: randomUUID() });
  const server = app.getHttpServer();
  let sellerId;
  try {
    await prisma.user.createMany({ data: userIds.map((id, index) => ({ id, email: `seller-check-${id}@example.test`, passwordHash: 'not-a-login-password', role: roles[index] })) });
    await prisma.mediaAsset.create({ data: { id: documentId, ownerUserId: userIds[0], storageKey: `seller-check/${documentId}`, originalFileName: 'business.pdf', mimeType: 'application/pdf', byteSize: 1, status: 'AVAILABLE' } });
    const application = { businessName: 'Integration business', registrationNumber: 'PRIVATE-REGISTRATION', country: 'ZM', businessAddress: 'Private verification address', contactEmail: 'business@example.test', documentIds: [documentId] };
    await request(server).get('/api/v1/admin/sellers').expect(401);
    await request(server).get('/api/v1/admin/sellers').auth(token(0), { type: 'bearer' }).expect(403);
    await request(server).post('/api/v1/sellers/applications').auth(token(2), { type: 'bearer' }).send(application).expect(400);
    assert.equal((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: documentId } })).verificationLocked, false);
    await request(server).post('/api/v1/sellers/applications').auth(token(0), { type: 'bearer' }).send({ ...application, status: 'APPROVED' }).expect(400);
    const response = await request(server).post('/api/v1/sellers/applications').auth(token(0), { type: 'bearer' }).send(application).expect(201);
    sellerId = response.body.data.id;
    assert.equal(response.body.data.status, 'PENDING');
    await request(server).post('/api/v1/sellers/applications').auth(token(0), { type: 'bearer' }).send(application).expect(409);
    await request(server).get('/api/v1/sellers/me').auth(token(2), { type: 'bearer' }).expect(404);
    await request(server).get(`/api/v1/admin/sellers/${sellerId}`).auth(token(0), { type: 'bearer' }).expect(403);
    const queue = await request(server).get('/api/v1/admin/sellers?status=PENDING').auth(token(1), { type: 'bearer' }).expect(200);
    assert.ok(!JSON.stringify(queue.body).includes('PRIVATE-REGISTRATION'));
    await request(server).delete(`/api/v1/media/${documentId}`).auth(token(0), { type: 'bearer' }).expect(409);
    const decisions = await Promise.allSettled([
      sellers.review(userIds[1], sellerId, 'APPROVED', { version: 0, reason: 'Evidence checked' }),
      sellers.review(userIds[1], sellerId, 'REJECTED', { version: 0, reason: 'Evidence incomplete' }),
    ]);
    assert.equal(decisions.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(await prisma.auditEvent.count({ where: { targetId: sellerId, action: { in: ['seller.approved', 'seller.rejected'] } } }), 1);
    let seller = await sellers.mine(userIds[0]);
    if (seller.status === 'REJECTED') {
      seller = await sellers.resubmit(userIds[0], application);
      seller = await sellers.review(userIds[1], sellerId, 'APPROVED', { version: seller.version, reason: 'Corrected evidence verified' });
    }
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: userIds[0] } })).role, 'SELLER');
    await sellers.requireApproved(userIds[0]);
    seller = await sellers.review(userIds[1], sellerId, 'SUSPENDED', { version: seller.version, reason: 'Manual compliance review' });
    await assert.rejects(() => sellers.requireApproved(userIds[0]), { status: 403 });
    await sellers.review(userIds[1], sellerId, 'APPROVED', { version: seller.version, reason: 'Review completed' });
    await prisma.user.update({ where: { id: userIds[1] }, data: { role: 'CUSTOMER' } });
    await request(server).get(`/api/v1/admin/sellers/${sellerId}`).auth(token(1), { type: 'bearer' }).expect(403);
    console.log('Seller database/HTTP checks passed: ownership, validation, roles, document locks, concurrent reviews, audit atomicity, resubmission, suspension, reinstatement.');
  } finally {
    await prisma.seller.deleteMany({ where: { ownerUserId: { in: userIds } } });
    await prisma.mediaAsset.deleteMany({ where: { id: documentId } });
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
