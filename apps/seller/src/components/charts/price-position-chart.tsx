import { formatMoney, type PricePosition } from '@commerce/contracts';

import { ChartFrame, Legend, NoData } from './chart-frame';

const ROW = 28;
const LABEL_W = 168;
const PLOT_W = 240;
const DOT = 5;
const MAX_ROWS = 8;

/**
 * Each active offer's price against the best price on the same SKU.
 *
 * A dumbbell, because the question is a per-item comparison of two values —
 * yours and the market's — not a magnitude. One hue in two shades keeps it
 * one story; a second hue would imply two unrelated series.
 */
export function PricePositionChart({ prices }: { prices: PricePosition[] }) {
  const rows = prices.slice(0, MAX_ROWS);
  const table = {
    columns: ['SKU', 'Your price', 'Best price', 'Other sellers'],
    rows: prices.map((row) => [
      row.skuCode,
      formatMoney(row.yourPrice),
      formatMoney(row.bestPrice),
      row.competitors,
    ]),
  };

  if (rows.length === 0) {
    return (
      <ChartFrame
        title="Your price against the best offer"
        description="How each of your active offers compares with the cheapest on the same SKU."
        table={table}
      >
        <NoData message="No active offers yet. Price a SKU and activate the offer to see this." />
      </ChartFrame>
    );
  }

  const values = rows.flatMap((row) => [
    row.yourPrice.amountMinor,
    row.bestPrice.amountMinor,
  ]);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const scale = (amount: number) =>
    LABEL_W + ((amount - low) / span) * (PLOT_W - 16) + 8;

  const width = LABEL_W + PLOT_W + 76;
  const height = rows.length * ROW + 6;
  const undercut = prices.filter((row) => !row.isBest).length;

  return (
    <ChartFrame
      title="Your price against the best offer"
      description={
        undercut > 0
          ? `You are undercut on ${undercut} of ${prices.length} active offers.`
          : `You hold the best price on all ${prices.length} of your active offers.`
      }
      table={table}
      footer={
        <Legend
          items={[
            { label: 'Your price', color: 'var(--viz-pair-strong)' },
            { label: 'Best price on the SKU', color: 'var(--viz-pair-soft)' },
          ]}
        />
      }
    >
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={`Your price against the best offer for ${rows.length} SKUs`}
          className="max-w-full"
        >
          {rows.map((row, index) => {
            const y = index * ROW + ROW / 2;
            const yours = scale(row.yourPrice.amountMinor);
            const best = scale(row.bestPrice.amountMinor);
            const gap = row.yourPrice.amountMinor - row.bestPrice.amountMinor;

            return (
              <g key={row.skuId}>
                <rect
                  x={0}
                  y={index * ROW}
                  width={width}
                  height={ROW}
                  fill="transparent"
                >
                  <title>
                    {`${row.productName} · ${row.skuCode}: you ${formatMoney(row.yourPrice)}, best ${formatMoney(row.bestPrice)}, ${row.competitors} other seller${row.competitors === 1 ? '' : 's'}`}
                  </title>
                </rect>

                <text
                  x={LABEL_W - 10}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="fill-muted-foreground font-mono text-[10px]"
                >
                  {row.skuCode}
                </text>

                {/* The connector carries the size of the gap. */}
                <line
                  x1={Math.min(yours, best)}
                  y1={y}
                  x2={Math.max(yours, best)}
                  y2={y}
                  style={{ stroke: 'var(--viz-pair-soft)' }}
                  strokeWidth={2}
                  strokeLinecap="round"
                />

                {/* Surface rings keep the dots legible where they overlap. */}
                <circle
                  cx={best}
                  cy={y}
                  r={DOT}
                  style={{
                    fill: 'var(--viz-pair-soft)',
                    stroke: 'var(--card)',
                  }}
                  strokeWidth={2}
                />
                <circle
                  cx={yours}
                  cy={y}
                  r={DOT}
                  style={{
                    fill: 'var(--viz-pair-strong)',
                    stroke: 'var(--card)',
                  }}
                  strokeWidth={2}
                />

                <text
                  x={LABEL_W + PLOT_W + 12}
                  y={y}
                  dominantBaseline="central"
                  className="fill-foreground text-[11px] tabular-nums"
                >
                  {gap === 0
                    ? 'best'
                    : `+${formatMoney({ ...row.yourPrice, amountMinor: gap })}`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {prices.length > MAX_ROWS ? (
        <p className="text-muted-foreground text-xs">
          Showing the {MAX_ROWS} with the largest gap. All {prices.length} are
          in the table view.
        </p>
      ) : null}
    </ChartFrame>
  );
}
