import { CheckCircle2, CircleSlash, PackageX, Tag } from 'lucide-react';
import type { ReactNode } from 'react';

import type { Buyability, BuyabilityReason } from '@commerce/contracts';

import { ChartFrame, Legend, NoData } from './chart-frame';

const BAR_H = 22;
const GAP = 2;

/**
 * Why an active product is, or is not, buyable.
 *
 * Status colours rather than categorical: these segments *mean* good through
 * critical, and reusing a series hue for them would say "identity" where the
 * data says "state". Two of the four sit below 3:1 on a white surface by
 * design, so each ships an icon and a label, values are written beside the
 * bar, and the table view carries every figure.
 */
const REASONS: Record<
  BuyabilityReason,
  { label: string; color: string; icon: ReactNode; hint: string }
> = {
  onSale: {
    label: 'On sale',
    color: 'var(--viz-good)',
    icon: <CheckCircle2 className="size-3 shrink-0" aria-hidden />,
    hint: 'An active offer from an approved seller, with stock to ship.',
  },
  noOffer: {
    label: 'No offer',
    color: 'var(--viz-warning)',
    icon: <Tag className="size-3 shrink-0" aria-hidden />,
    hint: 'Approved and in the catalog, but nobody has priced it.',
  },
  outOfStock: {
    label: 'Out of stock',
    color: 'var(--viz-serious)',
    icon: <PackageX className="size-3 shrink-0" aria-hidden />,
    hint: 'Priced and active, but there is nothing on the shelf.',
  },
  sellerSuspended: {
    label: 'Seller suspended',
    color: 'var(--viz-critical)',
    icon: <CircleSlash className="size-3 shrink-0" aria-hidden />,
    hint: 'The only offers come from a seller who cannot trade.',
  },
};

export function BuyabilityChart({ buyability }: { buyability: Buyability[] }) {
  const total = buyability.reduce((sum, entry) => sum + entry.products, 0);
  const present = buyability.filter((entry) => entry.products > 0);

  const table = {
    columns: ['Reason', 'Products', 'Share'],
    rows: buyability.map((entry) => [
      REASONS[entry.reason].label,
      entry.products,
      total === 0 ? '—' : `${Math.round((entry.products / total) * 100)}%`,
    ]),
  };

  if (total === 0 || present.length < 2) {
    const onlyOnSale = present.length === 1 && present[0]?.reason === 'onSale';

    return (
      <ChartFrame
        title="Why active products are not selling"
        description="Every approved product, split by whether a shopper can actually buy it."
        table={table}
      >
        <NoData
          message={
            total === 0
              ? 'No approved products yet.'
              : onlyOnSale
                ? `All ${total} approved products are buyable. Nothing is blocked.`
                : `All ${total} approved products are blocked: ${REASONS[present[0]!.reason].label.toLowerCase()}.`
          }
        />
      </ChartFrame>
    );
  }

  const width = 600;
  const onSale =
    buyability.find((entry) => entry.reason === 'onSale')?.products ?? 0;

  // A prefix sum rather than an accumulator: nothing is mutated during
  // render, which keeps the component pure.
  const shares = present.map((entry) => (entry.products / total) * width);
  const segments = present.map((entry, index) => ({
    ...entry,
    x: shares.slice(0, index).reduce((sum, share) => sum + share, 0),
    // 2px of surface separates touching segments — a gap, never a stroke,
    // which would add ink that is not data.
    width: Math.max(
      shares[index]! - (index === present.length - 1 ? 0 : GAP),
      2,
    ),
    rounded: index === 0 || index === present.length - 1,
  }));

  return (
    <ChartFrame
      title="Why active products are not selling"
      description={`${onSale} of ${total} approved products are buyable right now. The rest are blocked for these reasons.`}
      table={table}
      footer={
        <div className="space-y-2">
          <Legend
            items={present.map((entry) => ({
              label: `${REASONS[entry.reason].label} (${entry.products})`,
              color: REASONS[entry.reason].color,
              icon: REASONS[entry.reason].icon,
            }))}
          />
          <ul className="text-muted-foreground space-y-0.5 text-xs">
            {present
              .filter((entry) => entry.reason !== 'onSale')
              .map((entry) => (
                <li key={entry.reason}>
                  <span className="text-foreground font-medium">
                    {REASONS[entry.reason].label}:
                  </span>{' '}
                  {REASONS[entry.reason].hint}
                </li>
              ))}
          </ul>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${BAR_H}`}
          width={width}
          height={BAR_H}
          role="img"
          aria-label={`${onSale} of ${total} approved products are buyable`}
          className="max-w-full"
        >
          {segments.map((segment) => (
            <rect
              key={segment.reason}
              x={segment.x}
              y={0}
              width={segment.width}
              height={BAR_H}
              rx={segment.rounded ? 4 : 0}
              style={{ fill: REASONS[segment.reason].color }}
            >
              <title>
                {`${REASONS[segment.reason].label}: ${segment.products} of ${total} products`}
              </title>
            </rect>
          ))}
        </svg>
      </div>
    </ChartFrame>
  );
}
