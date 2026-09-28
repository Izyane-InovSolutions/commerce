import type { TransactionDayTotal } from '@/components/transactions-area-chart';

/**
 * Sample day totals for the overview page's transactions chart.
 *
 * Payment method (card vs mobile money) is collected at checkout but never
 * persisted against the payment, so there is no admin endpoint to aggregate
 * it from yet — this generates a deterministic, clearly-labelled stand-in
 * series instead of leaving the chart empty. Swap this out once that
 * reporting endpoint exists.
 */
export function sampleTransactionSeries(
  days = 90,
  endDate: Date = new Date(),
): TransactionDayTotal[] {
  const end = new Date(
    Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate(),
    ),
  );

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - (days - 1 - index));
    const dayOfWeek = date.getUTCDay();
    const weekendDip = dayOfWeek === 0 || dayOfWeek === 6 ? 0.75 : 1;

    const card = Math.round(
      (1800 + 700 * Math.sin(index / 6) + 300 * Math.sin(index / 2.3)) *
        weekendDip,
    );
    const mobileMoney = Math.round(
      (2600 +
        1100 * Math.sin(index / 5 + 1.4) +
        400 * Math.cos(index / 3.1)) *
        weekendDip,
    );

    return {
      date: date.toISOString().slice(0, 10),
      card: Math.max(card, 0),
      mobileMoney: Math.max(mobileMoney, 0),
    };
  });
}
