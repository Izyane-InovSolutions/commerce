import type { Contribution } from '@commerce/contracts';

import { ChartFrame, NoData } from './chart-frame';

const ROW = 26;
const BAR = 14;
const LABEL_W = 150;
const PLOT_W = 300;

/**
 * Who put each product into the shared catalog.
 *
 * Sellers have no natural order, so every bar takes the same hue: colouring
 * them darker-where-bigger would re-encode the bar length and spend the
 * identity channel on nothing. One series, so the title is the legend.
 */
export function ContributionChart({
  contribution,
}: {
  contribution: Contribution[];
}) {
  const table = {
    columns: ['Source', 'Products'],
    rows: contribution.map((entry) => [entry.sellerName, entry.products]),
  };

  // One source is not a comparison, so a bar chart of it would be a chart
  // with nothing to compare. The sentence is the honest form.
  if (contribution.length < 2) {
    const only = contribution[0];
    return (
      <ChartFrame
        title="Catalog contribution"
        description="How many products each seller has put into the catalog."
        table={table}
      >
        <NoData
          message={
            only
              ? `All ${only.products} products came from ${only.sellerName}. No other source has contributed one yet.`
              : 'No products in the catalog yet.'
          }
        />
      </ChartFrame>
    );
  }

  const rows = contribution.slice(0, 8);
  const most = Math.max(...rows.map((entry) => entry.products), 1);
  const width = LABEL_W + PLOT_W + 44;
  const height = rows.length * ROW;

  return (
    <ChartFrame
      title="Catalog contribution"
      description="How many products each seller has put into the catalog, alongside the platform's own."
      table={table}
    >
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label="Products contributed to the catalog, by source"
          className="max-w-full"
        >
          {rows.map((entry, index) => {
            const y = index * ROW;
            const length = (entry.products / most) * PLOT_W;

            return (
              <g key={entry.sellerId ?? 'platform'}>
                <rect x={0} y={y} width={width} height={ROW} fill="transparent">
                  <title>{`${entry.sellerName}: ${entry.products} products`}</title>
                </rect>

                <text
                  x={LABEL_W - 10}
                  y={y + ROW / 2}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="fill-muted-foreground text-[11px]"
                >
                  {entry.sellerName}
                </text>

                <rect
                  x={LABEL_W}
                  y={y + (ROW - BAR) / 2}
                  width={Math.max(length, 2)}
                  height={BAR}
                  rx={4}
                  style={{ fill: 'var(--viz-series-1)' }}
                />

                <text
                  x={LABEL_W + length + 8}
                  y={y + ROW / 2}
                  dominantBaseline="central"
                  className="fill-foreground text-[11px] tabular-nums"
                >
                  {entry.products}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </ChartFrame>
  );
}
