/**
 * Post-deploy repair/integrity command for #38's ProductRatingSummary /
 * SellerRatingSummary aggregates. Exact recalculation only — see
 * RatingAggregateService's doc comment.
 *
 * Run with:
 *   npx ts-node scripts/rebuild-review-summaries.ts           (rebuild)
 *   npx ts-node scripts/rebuild-review-summaries.ts --check   (integrity check only, exits 1 on mismatch)
 */
import { PrismaService } from '../src/database/prisma.service';
import { RatingAggregateService } from '../src/modules/reviews/rating-aggregate.service';

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  const service = new RatingAggregateService(prisma);
  const check = process.argv.includes('--check');

  try {
    if (check) {
      const result = await service.checkSummaryIntegrity();
      const total =
        result.productMismatches.length + result.sellerMismatches.length;
      if (total > 0) {
        // eslint-disable-next-line no-console
        console.error(
          `Summary integrity check failed: ${result.productMismatches.length} product mismatch(es), ${result.sellerMismatches.length} seller mismatch(es).`,
        );
        for (const mismatch of result.productMismatches) {
          // eslint-disable-next-line no-console
          console.error(
            `  product ${mismatch.id}: stored=${JSON.stringify(mismatch.stored)} recalculated=${JSON.stringify(mismatch.recalculated)}`,
          );
        }
        for (const mismatch of result.sellerMismatches) {
          // eslint-disable-next-line no-console
          console.error(
            `  seller ${mismatch.id}: stored=${JSON.stringify(mismatch.stored)} recalculated=${JSON.stringify(mismatch.recalculated)}`,
          );
        }
        process.exitCode = 1;
        return;
      }
      // eslint-disable-next-line no-console
      console.log(
        'Summary integrity check passed: every stored aggregate matches a fresh recalculation.',
      );
    } else {
      const result = await service.rebuildAllSummaries();
      // eslint-disable-next-line no-console
      console.log(
        `Rebuild complete: ${result.productsRebuilt} product summary(ies), ${result.sellersRebuilt} seller summary(ies) recalculated.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Rebuild failed:', error);
  process.exitCode = 1;
});
