import type { OfferDepth } from '@commerce/contracts';

import { ChartFrame, NoData } from './chart-frame';

const ROW = 30;
const BAR = 16;
const LABEL_W = 96;
const PLOT_W = 300;

/** One hue, monotone lightness: the buckets are ordered, so the colour is too. */
const STEPS = [
  'var(--viz-ordinal-1)',
  'var(--viz-ordinal-2)',
  'var(--viz-ordinal-3)',
];

const LABELS: Record<OfferDepth['bucket'], string> = {
  '1': 'One seller',
  '2': 'Two sellers',
  '3+': 'Three or more',
};

/**
 * How much competition each buyable product has.
 *
 * The buckets are an ordered scale, not names — one seller is genuinely less
 * than three — so they take an ordinal ramp rather than categorical hues, and
 * the reader sees the order in the colour.
 */
export function OfferDepthChart({ offerDepth }: { offerDepth: OfferDepth[] }) {
  const total = offerDepth.reduce((sum, entry) => sum + entry.products, 0);
  const table = {
    columns: ['Active offers', 'Products'],
    rows: offerDepth.map((entry) => [LABELS[entry.bucket], entry.products]),
  };

  if (total === 0) {
    return (
      <ChartFrame
        title="Competition per product"
        description="How many approved sellers have an active offer on the same product."
        table={table}
      >
        <NoData message="No products carry an active offer yet." />
      </ChartFrame>
    );
  }

  const most = Math.max(...offerDepth.map((entry) => entry.products), 1);
  const single =
    offerDepth.find((entry) => entry.bucket === '1')?.products ?? 0;
  const width = LABEL_W + PLOT_W + 44;
  const height = offerDepth.length * ROW;

  return (
    <ChartFrame
      title="Competition per product"
      description={`${single} of ${total} products depend on a single seller. Those are the listings that vanish if that seller stops trading.`}
      table={table}
    >
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label="Products by how many sellers offer them"
          className="max-w-full"
        >
          {offerDepth.map((entry, index) => {
            const y = index * ROW;
            const length = (entry.products / most) * PLOT_W;

            return (
              <g key={entry.bucket}>
                <rect x={0} y={y} width={width} height={ROW} fill="transparent">
                  <title>{`${LABELS[entry.bucket]}: ${entry.products} products`}</title>
                </rect>

                <text
                  x={LABEL_W - 10}
                  y={y + ROW / 2}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="fill-muted-foreground text-[11px]"
                >
                  {LABELS[entry.bucket]}
                </text>

                <rect
                  x={LABEL_W}
                  y={y + (ROW - BAR) / 2}
                  width={Math.max(length, 2)}
                  height={BAR}
                  rx={4}
                  style={{ fill: STEPS[index] ?? STEPS[0] }}
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
