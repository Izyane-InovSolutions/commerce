'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import type {
  BackendAnalyticsInterval,
  BackendSalesAnalyticsPoint,
} from '@commerce/contracts';

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
import { formatBucket } from '@/lib/analytics';
import { formatMinor } from '@/lib/money';

const CHART_CONFIG = {
  gross: { label: 'Gross sales', color: 'var(--chart-series)' },
} satisfies ChartConfig;

/** A trailing window the reader can narrow a daily series to. */
export type SalesChartRange = { days: number; label: string };

/**
 * Gross sales over time, one point per bucket.
 *
 * Amounts arrive in minor units and are plotted in major ones, so the axis
 * reads as money; the tooltip adds the order count behind each bucket. With
 * `ranges`, a daily series can be narrowed to a trailing window in place —
 * the overview's quick look — without another request.
 */
export function SalesAreaChart({
  title = 'Sales',
  description,
  series,
  currency,
  interval,
  ranges,
  footer,
}: {
  title?: string;
  description: string;
  series: BackendSalesAnalyticsPoint[];
  currency: string;
  interval: BackendAnalyticsInterval;
  /** Trailing windows to offer, longest first; the first is the default. */
  ranges?: SalesChartRange[];
  footer?: ReactNode;
}) {
  const [days, setDays] = useState(ranges?.[0]?.days ?? 0);

  const data = useMemo(() => {
    const visible = days > 0 ? series.slice(-days) : series;
    return visible.map((point) => ({
      periodStart: point.periodStart,
      orderCount: point.orderCount,
      grossAmount: point.grossAmount,
      gross: point.grossAmount / 100,
    }));
  }, [series, days]);

  const range = ranges?.find((option) => option.days === days);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {range ? `${description} ${range.label}.` : description}
        </CardDescription>
        {ranges && ranges.length > 1 ? (
          <CardAction>
            <SelectField
              aria-label="Date range"
              value={String(days)}
              onChange={(event) => setDays(Number(event.target.value))}
              options={ranges.map((option) => ({
                value: String(option.days),
                label: option.label.charAt(0).toUpperCase() + option.label.slice(1),
              }))}
              className="w-40"
            />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 px-2 pt-4 sm:px-6 sm:pt-6">
        {data.length === 0 ? (
          <p className="text-muted-foreground px-4 py-12 text-center text-sm">
            No sales in this range.
          </p>
        ) : (
          <ChartContainer
            config={CHART_CONFIG}
            className="aspect-auto h-[280px] w-full"
          >
            <AreaChart data={data}>
              <defs>
                <linearGradient id="fillGross" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-gross)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-gross)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="periodStart"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value: string) => formatBucket(value, interval)}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={72}
                tickFormatter={(value: number) =>
                  new Intl.NumberFormat('en-GB', {
                    notation: 'compact',
                    maximumFractionDigits: 1,
                  }).format(value)
                }
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const periodStart = payload?.[0]?.payload?.periodStart;
                      return typeof periodStart === 'string'
                        ? formatBucket(periodStart, interval, 'long')
                        : null;
                    }}
                    formatter={(_, __, item) => {
                      const point = item.payload as (typeof data)[number];
                      return (
                        <div className="flex w-full flex-col gap-0.5">
                          <span className="flex justify-between gap-4">
                            <span className="text-muted-foreground">
                              Gross sales
                            </span>
                            <span className="font-mono font-medium tabular-nums">
                              {formatMinor(point.grossAmount, currency)}
                            </span>
                          </span>
                          <span className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Orders</span>
                            <span className="font-mono font-medium tabular-nums">
                              {point.orderCount}
                            </span>
                          </span>
                        </div>
                      );
                    }}
                    indicator="dot"
                  />
                }
              />
              <Area
                dataKey="gross"
                type="monotone"
                fill="url(#fillGross)"
                stroke="var(--color-gross)"
              />
            </AreaChart>
          </ChartContainer>
        )}
        {footer}
      </CardContent>
    </Card>
  );
}
