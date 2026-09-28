'use client';

import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';

import { SelectField } from '@/components/select-field';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { aggregateTransactionsByMonth } from '@/lib/sample-transactions';

export type TransactionDayTotal = {
  /** ISO date, e.g. `2026-09-25`. */
  date: string;
  card: number;
  mobileMoney: number;
};

export type TransactionMonthTotal = {
  /** Year and month, e.g. `2026-09`. */
  month: string;
  card: number;
  mobileMoney: number;
};

const CHART_CONFIG = {
  card: { label: 'Card', color: 'var(--color-blue-600)' },
  mobileMoney: { label: 'Mobile money', color: 'var(--color-amber-500)' },
} satisfies ChartConfig;

const RANGE_OPTIONS = [
  { value: '12', label: 'Last 12 months' },
  { value: '6', label: 'Last 6 months' },
  { value: '3', label: 'Last 3 months' },
];

const RANGE_DESCRIPTION: Record<string, string> = {
  '12': 'Card and mobile money transaction volume for the last 12 months.',
  '6': 'Card and mobile money transaction volume for the last 6 months.',
  '3': 'Card and mobile money transaction volume for the last 3 months.',
};

function formatMonthTick(value: string): string {
  const [year = 0, month = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

/**
 * The overview page's payment method trend — card vs mobile money, by month.
 *
 * There is no admin reporting endpoint for this yet (payment method is
 * collected at checkout but never persisted against the payment), so `data`
 * is generated server-side as clearly-labelled sample volume rather than
 * pretending to be real — swap in a real series once that endpoint exists.
 */
export function TransactionsAreaChart({
  data,
}: {
  data: TransactionDayTotal[];
}) {
  const [months, setMonths] = useState('12');

  const monthly = useMemo(() => aggregateTransactionsByMonth(data), [data]);
  const filtered = useMemo(
    () => monthly.slice(-Number(months)),
    [monthly, months],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transactions</CardTitle>
        <CardDescription>{RANGE_DESCRIPTION[months]}</CardDescription>
        <CardAction>
          <SelectField
            aria-label="Date range"
            value={months}
            onChange={(event) => setMonths(event.target.value)}
            options={RANGE_OPTIONS}
            className="w-40"
          />
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={CHART_CONFIG}
          className="aspect-auto h-[280px] w-full"
        >
          <AreaChart data={filtered}>
            <defs>
              <linearGradient id="fillCard" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-card)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-card)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillMobileMoney" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-mobileMoney)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-mobileMoney)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={formatMonthTick}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => formatMonthTick(String(value))}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="mobileMoney"
              type="natural"
              fill="url(#fillMobileMoney)"
              stroke="var(--color-mobileMoney)"
              stackId="a"
            />
            <Area
              dataKey="card"
              type="natural"
              fill="url(#fillCard)"
              stroke="var(--color-card)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
