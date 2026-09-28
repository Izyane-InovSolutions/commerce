'use client';

import { LabelList, Pie, PieChart } from 'recharts';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { CategorySalesShare } from '@/lib/sample-category-sales';

const SLICE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

/**
 * The overview page's best-selling-categories breakdown — see
 * `sampleCategorySalesShares` for why the shares themselves are sample data
 * rather than real sales figures.
 */
export function CategorySalesPieChart({
  shares,
}: {
  shares: CategorySalesShare[];
}) {
  if (shares.length === 0) {
    return null;
  }

  const data = shares.map((share, index) => ({
    ...share,
    fill: SLICE_COLORS[index % SLICE_COLORS.length],
  }));

  const config = Object.fromEntries(
    data.map((share) => [
      share.slug,
      { label: share.category, color: share.fill },
    ]),
  ) satisfies ChartConfig;

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>Best-selling categories</CardTitle>
        <CardDescription>Share of sales by category</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={config}
          className="mx-auto aspect-square max-h-[280px] [&_.recharts-text]:fill-background"
        >
          <PieChart>
            <ChartTooltip
              content={<ChartTooltipContent nameKey="slug" hideLabel />}
            />
            <Pie data={data} dataKey="value" nameKey="slug">
              <LabelList
                dataKey="category"
                className="fill-background"
                stroke="none"
                fontSize={12}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <p className="text-muted-foreground leading-none">
          Sample share — there is no sales-by-category endpoint yet.
        </p>
      </CardFooter>
    </Card>
  );
}
