import type { BackendLowStockItem } from '@commerce/contracts';

/** Stock at or under its reorder point, emptiest first. */
export function LowStockList({
  items,
  total,
}: {
  items: BackendLowStockItem[];
  /** Low plus out-of-stock records overall; the list shows the worst few. */
  total: number;
}) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing is running low.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y">
        {items.map((item) => (
          <li
            key={item.inventoryRecordId}
            className="flex items-center justify-between gap-3 py-2 text-sm"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {item.productName}
              </span>
              <span className="text-muted-foreground block truncate text-xs">
                {item.skuCode}
                {item.warehouseName ? ` in ${item.warehouseName}` : ''}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span
                className={
                  item.available <= 0
                    ? 'block font-semibold text-red-700 dark:text-red-400'
                    : 'block font-semibold'
                }
              >
                {item.available <= 0 ? 'Out of stock' : `${item.available} left`}
              </span>
              {item.reorderPoint > 0 ? (
                <span className="text-muted-foreground block text-xs">
                  Reorder at {item.reorderPoint}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {total > items.length ? (
        <p className="text-muted-foreground text-xs">
          {total - items.length} more running low.
        </p>
      ) : null}
    </div>
  );
}
