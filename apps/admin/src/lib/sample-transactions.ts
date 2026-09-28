import type {
  TransactionDayTotal,
  TransactionMonthTotal,
} from '@/components/transactions-area-chart';

/**
 * Sample day totals for the overview page's transactions chart.
 *
 * Payment method (card vs mobile money) is collected at checkout but never
 * persisted against the payment, so there is no admin endpoint to aggregate
 * it from yet — this generates a deterministic, clearly-labelled stand-in
 * series instead of leaving the chart empty. Swap this out once that
 * reporting endpoint exists.
 *
 * Defaults to a full year so the chart's monthly timeline always has 12
 * months to show.
 */
export function sampleTransactionSeries(
  days = 365,
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

/** Rolls a daily series up into calendar-month totals, oldest first. */
export function aggregateTransactionsByMonth(
  data: TransactionDayTotal[],
): TransactionMonthTotal[] {
  const totals = new Map<string, TransactionMonthTotal>();

  for (const day of data) {
    const month = day.date.slice(0, 7);
    const existing = totals.get(month);
    if (existing) {
      existing.card += day.card;
      existing.mobileMoney += day.mobileMoney;
    } else {
      totals.set(month, { month, card: day.card, mobileMoney: day.mobileMoney });
    }
  }

  return Array.from(totals.values()).sort((a, b) =>
    a.month.localeCompare(b.month),
  );
}
