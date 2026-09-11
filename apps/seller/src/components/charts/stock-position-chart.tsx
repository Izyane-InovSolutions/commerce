import type { StockPosition } from '@commerce/contracts';

import { ChartFrame, Legend, NoData } from './chart-frame';

const ROW = 26;
const BAR = 14;
const GAP = 2;
const LABEL_W = 168;
const VALUE_W = 52;
const MAX_ROWS = 8;

/**
 * Stock measured against its reorder point.
 *
 * A diverging bar because the reader's question is not "how much stock" but
 * "which SKUs are under the line, and by how far" — a delta against a target.
 * Warm and cool poles read as opposite; the zero line is chrome, not a third
 * colour.
 */
export function StockPositionChart({ stock }: { stock: StockPosition[] }) {
  const rows = stock.slice(0, MAX_ROWS);
  const table = {
    columns: ['SKU', 'Available', 'Reorder at', 'Difference'],
    rows: stock.map((row) => [
      row.skuCode,
      row.available,
      row.reorderThreshold,
      row.delta > 0 ? `+${row.delta}` : row.delta,
    ]),
  };

  if (rows.length === 0) {
    return (
      <ChartFrame
        title="Stock against your reorder points"
        description="How far each SKU sits above or below the level you want to restock at."
        table={table}
      >
        <NoData message="No stock records yet. They open once you sell a SKU." />
      </ChartFrame>
    );
  }

  // One symmetric scale, so a shortfall of 5 and a surplus of 5 draw the same
  // length on either side of the baseline.
  const reach = Math.max(...rows.map((row) => Math.abs(row.delta)), 1);
  const plotW = 260;
  const half = plotW / 2;
  const width = LABEL_W + plotW + VALUE_W;
  const height = rows.length * ROW + 22;
  const axisX = LABEL_W + half;
  const short = rows.filter((row) => row.delta < 0).length;

  return (
    <ChartFrame
      title="Stock against your reorder points"
      description={
        short > 0
          ? `${short} of your ${stock.length} SKUs are at or below the level you want to restock at.`
          : 'Every SKU is above the level you want to restock at.'
      }
      table={table}
      footer={
        <Legend
          items={[
            { label: 'Above reorder point', color: 'var(--viz-diverging-pos)' },
            { label: 'Below — restock', color: 'var(--viz-diverging-neg)' },
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
          aria-label={`Stock against reorder point for ${rows.length} SKUs`}
          className="max-w-full"
        >
          {/* Baseline: chrome, a solid hairline one step off the surface. */}
          <line
            x1={axisX}
            y1={0}
            x2={axisX}
            y2={rows.length * ROW}
            style={{ stroke: 'var(--viz-axis)' }}
            strokeWidth={1}
          />

          {rows.map((row, index) => {
            const y = index * ROW;
            const length = (Math.abs(row.delta) / reach) * (half - 6);
            const negative = row.delta < 0;
            const barY = y + (ROW - BAR) / 2;
            // 2px of surface separates the fill from the baseline.
            const x = negative ? axisX - GAP - length : axisX + GAP;
            const label = row.delta > 0 ? `+${row.delta}` : String(row.delta);

            return (
              <g key={row.skuId}>
                {/* A full-row hit target, so hover is not a pinpoint task. */}
                <rect x={0} y={y} width={width} height={ROW} fill="transparent">
                  <title>
                    {`${row.productName} · ${row.skuCode}: ${row.available} available, reorder at ${row.reorderThreshold}`}
                  </title>
                </rect>

                <text
                  x={LABEL_W - 10}
                  y={y + ROW / 2}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="fill-muted-foreground font-mono text-[10px]"
                >
                  {row.skuCode}
                </text>

                <rect
                  x={x}
                  y={barY}
                  width={Math.max(length, 2)}
                  height={BAR}
                  rx={4}
                  style={{
                    fill: negative
                      ? 'var(--viz-diverging-neg)'
                      : 'var(--viz-diverging-pos)',
                  }}
                />

                <text
                  x={LABEL_W + plotW + 8}
                  y={y + ROW / 2}
                  dominantBaseline="central"
                  className="fill-foreground text-[11px] tabular-nums"
                >
                  {label}
                </text>
              </g>
            );
          })}

          <text
            x={axisX}
            y={rows.length * ROW + 13}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-muted-foreground text-[10px]"
          >
            reorder point
          </text>
        </svg>
      </div>

      {stock.length > MAX_ROWS ? (
        <p className="text-muted-foreground text-xs">
          Showing the {MAX_ROWS} furthest below. All {stock.length} are in the
          table view.
        </p>
      ) : null}
    </ChartFrame>
  );
}
