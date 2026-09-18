/**
 * One-off backfill for #37: provisions a FulfillmentOrder for every
 * SELLER-mode ShippingGroup on an already-paid order that predates the
 * seller fulfillment portal. Safe to run any number of times — it relies on
 * the same unique-constraint-based idempotency as the normal `order.paid`
 * provisioning path (see FulfillmentProvisioningService.backfillSellerFulfillments).
 *
 * Run with:
 *   npx ts-node scripts/backfill-seller-fulfillments.ts
 */
import { PrismaService } from '../src/database/prisma.service';
import { NumberingService } from '../src/common/numbering/numbering.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { OutboxService } from '../src/infrastructure/jobs/outbox.service';
import { FulfillmentProvisioningService } from '../src/modules/fulfillment/provisioning/fulfillment-provisioning.service';

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();

  const numberingService = new NumberingService();
  const auditService = new AuditService(prisma);
  const outboxService = new OutboxService(prisma);
  const provisioningService = new FulfillmentProvisioningService(
    prisma,
    numberingService,
    auditService,
    outboxService,
  );

  try {
    const result = await provisioningService.backfillSellerFulfillments();
    // eslint-disable-next-line no-console
    console.log(
      `Backfill complete: scanned ${result.scanned} seller-mode shipping group(s) missing a FulfillmentOrder, provisioned ${result.provisioned}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Backfill failed:', error);
  process.exitCode = 1;
});
