// Run after build/migrations: node --env-file=.env test/financial-integrity.database-check.cjs
// Creates UUID-scoped fixtures, exercises actual PostgreSQL transactions and
// concurrent connections, then removes only those fixtures. No HTTP calls.
require('reflect-metadata');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {PrismaClient} = require('@prisma/client');
const {ConfigService} = require('@nestjs/config');
const {InventoryService} = require('../dist/modules/inventory/inventory.service');
const {OfferReadService}=require('../dist/modules/offers/offer-read.service');
const {OrdersService} = require('../dist/modules/orders/orders.service');
const {LedgerService} = require('../dist/modules/financials/ledger.service');
const {PaymentsService} = require('../dist/modules/payments/payments.service');
const prisma = new PrismaClient();
const userId=randomUUID(),sellerId=randomUUID(),productId=randomUUID(),variantId=randomUUID(),warehouseId=randomUUID(),stockId=randomUUID();
const orderIds=[];
const inventory=new InventoryService(prisma,{enqueue:async()=>{}});
const config=new ConfigService({MARKETPLACE_COMMISSION_BPS:1000});
const ledger=new LedgerService(prisma,config);
let failSale=false,failRefund=false;
const failingLedger={
 ensureCurrency:(...args)=>ledger.ensureCurrency(...args),
 recordSale:async(...args)=>{if(failSale)throw new Error('Injected sale failure');return ledger.recordSale(...args);},
 recordRefundReversal:async(...args)=>{if(failRefund)throw new Error('Injected reversal failure');return ledger.recordRefundReversal(...args);},
};
const orders=new OrdersService(prisma,{},inventory,{},failingLedger,new OfferReadService(prisma));
let providerCalls=0,refundStatus='PENDING',event;
const provider={name:'integrity-test',refund:async()=>{providerCalls++;return {providerReference:randomUUID(),status:refundStatus};},getRefund:async id=>({providerReference:id,status:'SUCCEEDED'}),verifyWebhook:()=>event};
const payments=new PaymentsService(prisma,provider,orders,failingLedger);
async function fixture(total=1000,paid=true) {
 const id=randomUUID();orderIds.push(id);
 const order=await prisma.order.create({data:{id,userId,currency:'USD',subtotal:total,total,status:paid?'PAID':'PENDING_PAYMENT',shippingAddress:{},sellerOrders:{create:{sellerId,total,subtotal:total,currency:'USD',status:paid?'PAID':'PENDING_PAYMENT'}},payment:{create:{provider:provider.name,providerReference:randomUUID(),idempotencyKey:randomUUID(),amount:total,currency:'USD',status:paid?'SUCCEEDED':'PENDING'}}},include:{sellerOrders:true,payment:true}});
 if(paid)await ledger.recordSale(order.sellerOrders[0]);
 return {order,group:order.sellerOrders[0],payment:order.payment};
}
async function run(){
 try{
  await prisma.user.create({data:{id:userId,email:`integrity-${userId}@example.test`,passwordHash:'not-a-login-password'}});
  await prisma.seller.create({data:{id:sellerId,ownerUserId:userId,businessName:'Integrity fixture',registrationNumber:'TEST',country:'ZM',businessAddress:'Test',contactEmail:'test@example.test',status:'APPROVED'}});
  await prisma.product.create({data:{id:productId,name:'Integrity fixture',slug:productId}});
  await prisma.productVariant.create({data:{id:variantId,productId,skuCode:variantId}});
  await prisma.warehouse.create({data:{id:warehouseId,name:'Integrity fixture',code:warehouseId}});
  await prisma.inventoryRecord.create({data:{id:stockId,warehouseId,variantId,onHand:100,reserved:4}});
  const r1=await prisma.reservation.create({data:{inventoryRecordId:stockId,quantity:2,expiresAt:new Date(0)}});
  const r2=await prisma.reservation.create({data:{inventoryRecordId:stockId,quantity:2,expiresAt:new Date(Date.now()+60000)}});
  await Promise.all([inventory.release(r1.id),inventory.expireReservation(r1.id),inventory.release(r1.id)]);
  assert.equal((await prisma.inventoryRecord.findUniqueOrThrow({where:{id:stockId}})).reserved,2);
  assert.equal(await prisma.inventoryMovement.count({where:{referenceId:r1.id}}),1);
  await Promise.all([inventory.commit(r2.id),inventory.commit(r2.id)]);
  let stock=await prisma.inventoryRecord.findUniqueOrThrow({where:{id:stockId}});
  assert.equal(stock.onHand,98);assert.equal(stock.reserved,0);
  await Promise.all([inventory.restock(r2.id),inventory.restock(r2.id)]);
  assert.equal((await prisma.inventoryRecord.findUniqueOrThrow({where:{id:stockId}})).onHand,100);
  assert.equal(await prisma.inventoryMovement.count({where:{referenceId:r2.id,type:'RETURN'}}),1);
  console.log('PASS: concurrent release/expiry, duplicate commit and restock preserve inventory.');

  const first=await fixture();
  const key=randomUUID();
  const results=await Promise.allSettled([payments.refundSellerOrder(first.group.id,600,'Test refund',key),payments.refundSellerOrder(first.group.id,600,'Test refund',randomUUID())]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(providerCalls,1);
  const pending=results.find(r=>r.status==='fulfilled').value;
  assert.equal(pending.status,'PENDING');
  assert.equal((await prisma.payment.findUniqueOrThrow({where:{id:first.payment.id}})).refundedAmount,0);
  const beforeRetry=providerCalls;
  assert.equal((await payments.refundSellerOrder(first.group.id,600,'Test refund',pending.idempotencyKey)).id,pending.id);
  assert.equal(providerCalls,beforeRetry);
  await assert.rejects(payments.refundSellerOrder(first.group.id,500,'Test refund',pending.idempotencyKey));
  await Promise.all([payments.reconcileRefund(pending.id),payments.reconcileRefund(pending.id)]);
  assert.equal((await prisma.payment.findUniqueOrThrow({where:{id:first.payment.id}})).refundedAmount,600);
  assert.equal(await prisma.ledgerEntry.count({where:{referenceId:pending.id,type:'REFUND'}}),1);
  refundStatus='SUCCEEDED';
  await payments.refundSellerOrder(first.group.id,400,'Test refund',randomUUID());
  assert.equal((await prisma.order.findUniqueOrThrow({where:{id:first.order.id}})).status,'REFUNDED');
  assert.equal((await ledger.getBalance(sellerId)).balance,0);
  console.log('PASS: refund capacity is reserved across concurrent requests; retries and reconciliation apply once.');

  const partial=await fixture(10);
  config.set('MARKETPLACE_COMMISSION_BPS',5000);
  await payments.refundSellerOrder(partial.group.id,5,'Partial one',randomUUID());
  await payments.refundSellerOrder(partial.group.id,5,'Partial two',randomUUID());
  assert.equal((await ledger.getBalance(sellerId)).balance,0);
  config.set('MARKETPLACE_COMMISSION_BPS',1000);
  console.log('PASS: partial refunds exactly reverse original commission after a rate change.');

  const rollback=await fixture();
  failRefund=true;
  await assert.rejects(payments.refundSellerOrder(rollback.group.id,400,'Rollback test',randomUUID()),/Injected reversal/);
  const held=await prisma.refund.findFirstOrThrow({where:{sellerOrderId:rollback.group.id}});
  assert.equal(held.status,'PENDING');assert.ok(held.providerReference);
  assert.equal((await prisma.payment.findUniqueOrThrow({where:{id:rollback.payment.id}})).refundedAmount,0);
  assert.equal((await prisma.sellerOrder.findUniqueOrThrow({where:{id:rollback.group.id}})).refundedAmount,0);
  failRefund=false;
  await payments.reconcileRefund(held.id);
  assert.equal((await prisma.payment.findUniqueOrThrow({where:{id:rollback.payment.id}})).refundedAmount,400);
  console.log('PASS: failed finalization rolls back local effects and remains reconcilable.');

  const current=(await ledger.getBalance(sellerId)).balance;
  const payouts=await Promise.allSettled([ledger.recordPayout(sellerId,current),ledger.recordPayout(sellerId,current)]);
  assert.equal(payouts.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await ledger.getBalance(sellerId)).balance,0);
  await assert.rejects(ledger.recordSale({...rollback.group,id:randomUUID(),currency:'ZMW'}),/settlement currency/);
  console.log('PASS: concurrent payouts cannot overdraw; mixed currencies are rejected.');

  const webhook=await fixture(100,false);
  event={id:randomUUID(),providerReference:webhook.payment.providerReference,type:'payment.succeeded',status:'SUCCEEDED',payload:{}};
  failSale=true;
  await assert.rejects(payments.handleWebhook(Buffer.from('{}'),'test'),/Injected sale/);
  assert.equal(await prisma.paymentEvent.count({where:{paymentId:webhook.payment.id}}),0);
  assert.equal((await prisma.order.findUniqueOrThrow({where:{id:webhook.order.id}})).status,'PENDING_PAYMENT');
  failSale=false;
  await Promise.all([payments.handleWebhook(Buffer.from('{}'),'test'),payments.handleWebhook(Buffer.from('{}'),'test')]);
  await orders.confirmPayment(webhook.order.id);
  assert.equal(await prisma.ledgerEntry.count({where:{type:'SALE',referenceId:webhook.group.id}}),1);
  assert.equal(await prisma.paymentEvent.count({where:{paymentId:webhook.payment.id}}),1);
  console.log('PASS: webhook rollback remains retryable and repeated confirmation credits once.');
 }finally{
  await prisma.ledgerEntry.deleteMany({where:{sellerId}});
  await prisma.payout.deleteMany({where:{sellerId}});
  await prisma.sellerBalance.deleteMany({where:{sellerId}});
  await prisma.order.deleteMany({where:{id:{in:orderIds},userId}});
  await prisma.inventoryRecord.deleteMany({where:{id:stockId}});
  await prisma.warehouse.deleteMany({where:{id:warehouseId}});
  await prisma.product.deleteMany({where:{id:productId}});
  await prisma.seller.deleteMany({where:{id:sellerId,ownerUserId:userId}});
  await prisma.user.deleteMany({where:{id:userId}});
  await prisma.$disconnect();
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
