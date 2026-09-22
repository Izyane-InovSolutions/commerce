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
const {RefundCasesService} = require('../dist/modules/payments/refund-cases.service');
const prisma = new PrismaClient();
const userId=randomUUID(),sellerId=randomUUID(),productId=randomUUID(),variantId=randomUUID(),warehouseId=randomUUID(),stockId=randomUUID();
const orderIds=[];
const inventory=new InventoryService(prisma,{enqueue:async()=>{}});
const config=new ConfigService({MARKETPLACE_COMMISSION_BPS:1000});
const ledger=new LedgerService(prisma,config);
let failSale=false,failRefund=false;
const failingLedgerForOrders={
 ensureCurrency:(...args)=>ledger.ensureCurrency(...args),
 recordSale:async(...args)=>{if(failSale)throw new Error('Injected sale failure');return ledger.recordSale(...args);},
 recordRefundReversal:(...args)=>ledger.recordRefundReversal(...args),
};
const failingLedgerForRefunds={
 recordRefundReversal:async(...args)=>{if(failRefund)throw new Error('Injected reversal failure');return ledger.recordRefundReversal(...args);},
};
const noopJobs={enqueue:async()=>{}};
const noopOutbox={record:async()=>{}};
const orders=new OrdersService(prisma,{},inventory,{},failingLedgerForOrders,new OfferReadService(prisma),{},noopJobs,noopOutbox);
let providerCalls=0,refundStatus='PENDING',event;
const provider={name:'integrity-test',refund:async()=>{providerCalls++;return {providerReference:randomUUID(),status:refundStatus};},getRefund:async id=>({providerReference:id,status:'SUCCEEDED'}),verifyWebhook:()=>event};
const refundCases=new RefundCasesService(prisma,provider,orders,failingLedgerForRefunds);
const payments=new PaymentsService(prisma,provider,orders,refundCases);
async function fixture(total=1000,paid=true) {
 const id=randomUUID();orderIds.push(id);
 const order=await prisma.order.create({data:{id,userId,currency:'ZMW',subtotal:total,total,status:paid?'PAID':'PENDING_PAYMENT',shippingAddress:{},sellerOrders:{create:{sellerId,total,subtotal:total,currency:'ZMW',status:paid?'PAID':'PENDING_PAYMENT'}},payment:{create:{provider:provider.name,providerReference:randomUUID(),idempotencyKey:randomUUID(),amount:total,currency:'ZMW',status:paid?'SUCCEEDED':'PENDING'}}},include:{sellerOrders:true,payment:true}});
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
  const keyA=randomUUID(),keyB=randomUUID();
  const results=await Promise.allSettled([payments.refundSellerOrder(first.group.id,600,'Test refund',keyA),payments.refundSellerOrder(first.group.id,600,'Test refund',keyB)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(providerCalls,1);
  const pending=results.find(r=>r.status==='fulfilled').value;
  assert.equal(pending.status,'PENDING');
  assert.equal((await prisma.payment.findUniqueOrThrow({where:{id:first.payment.id}})).refundedAmount,0);
  // The Refund attempt's own idempotencyKey (derived, e.g. "<caseKey>:attempt:1")
  // is not the caller-facing key — replay with the RefundCase's own key, which
  // is whichever of keyA/keyB actually won the race above.
  const winningKey=(await prisma.refundCase.findFirstOrThrow({where:{sellerOrderId:first.group.id}})).idempotencyKey;
  const beforeRetry=providerCalls;
  assert.equal((await payments.refundSellerOrder(first.group.id,600,'Test refund',winningKey)).id,pending.id);
  assert.equal(providerCalls,beforeRetry);
  await assert.rejects(payments.refundSellerOrder(first.group.id,500,'Test refund',winningKey));
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
  const payoutKeyA=randomUUID(),payoutKeyB=randomUUID();
  const payouts=await Promise.allSettled([ledger.recordPayout(sellerId,current,payoutKeyA,userId),ledger.recordPayout(sellerId,current,payoutKeyB,userId)]);
  assert.equal(payouts.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await ledger.getBalance(sellerId)).balance,0);
  await assert.rejects(ledger.recordSale({...rollback.group,id:randomUUID(),currency:'USD'}),/settlement currency/);
  console.log('PASS: concurrent payouts cannot overdraw; mixed currencies are rejected.');

  const replayKey=randomUUID();
  const second=await fixture(200);
  const replayed=await Promise.all([
   ledger.recordPayout(sellerId,50,replayKey,userId,'ref-a','note-a'),
   ledger.recordPayout(sellerId,50,replayKey,userId,'ref-a','note-a'),
  ]);
  assert.equal(replayed[0].id,replayed[1].id);
  assert.equal(await prisma.payout.count({where:{idempotencyKey:replayKey}}),1);
  await assert.rejects(ledger.recordPayout(sellerId,50,replayKey,userId,'ref-b','note-b'));
  console.log('PASS: identical payout retries replay to one payout and one debit; key reuse with different input conflicts.');

  await assert.rejects(
   prisma.ledgerEntry.create({data:{sellerId,type:'SALE',referenceType:'seller_order',referenceId:second.group.id,grossAmount:1,commissionAmount:0,netAmount:1,currency:'ZMW'}}),
  );
  console.log('PASS: the database rejects a duplicate (sellerId, type, referenceType, referenceId) ledger entry outright.');

  const concurrentRefundKey=randomUUID();
  const [payoutOutcome]=await Promise.allSettled([
   ledger.recordPayout(sellerId,20,randomUUID(),userId),
   payments.refundSellerOrder(second.group.id,30,'Concurrent with payout',concurrentRefundKey),
  ]);
  void payoutOutcome;
  const entries=await prisma.ledgerEntry.findMany({where:{sellerId}});
  const summedNet=entries.reduce((sum,e)=>sum+e.netAmount,0);
  assert.equal((await ledger.getBalance(sellerId)).balance,summedNet);
  console.log('PASS: a concurrent payout and refund against the same seller balance never lose an update.');

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
