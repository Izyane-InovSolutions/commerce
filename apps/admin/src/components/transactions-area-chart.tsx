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

export type TransactionDayTotal = {
  /** ISO date, e.g. `2026-09-25`. */
  date: string;
  card: number;
  mobileMoney: number;
};

const CHART_CONFIG = {
  card: { label: 'Card', color: 'var(--chart-1)' },
  mobileMoney: { label: 'Mobile money', color: 'var(--chart-3)' },
} satisfies ChartConfig;

const RANGE_OPTIONS = [
  { value: '90', label: 'Last 3 months' },
  { value: '30', label: 'Last 30 days' },
  { value: '7', label: 'Last 7 days' },
];

const RANGE_DESCRIPTION: Record<string, string> = {
  '90': 'Card and mobile money transaction volume for the last 3 months.',
  '30': 'Card and mobile money transaction volume for the last 30 days.',
  '7': 'Card and mobile money transaction volume for the last 7 days.',
};

function formatTick(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * The overview page's payment method trend — card vs mobile money, by day.
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
  const [days, setDays] = useState('90');

  const filtered = useMemo(() => data.slice(-Number(days)), [data, days]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transactions</CardTitle>
        <CardDescription>{RANGE_DESCRIPTION[days]}</CardDescription>
        <CardAction>
          <SelectField
            aria-label="Date range"
            value={days}
            onChange={(event) => setDays(event.target.value)}
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
                  stopColor="var(--color-blue-500)"
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
                  stopColor="var(--color-blue-800)"
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
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={formatTick}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) =>
                    new Date(String(value)).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  }
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="mobileMoney"
              type="natural"
              fill="url(#fillMobileMoney)"
              stroke="var(--color-blue-800)"
              stackId="a"
            />
            <Area
              dataKey="card"
              type="natural"
              fill="url(#fillCard)"
              stroke="var(--color-blue-500)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
