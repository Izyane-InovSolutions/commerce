import type { BackendSalesAnalytics } from '@commerce/contracts';

import { formatMinor } from '@/lib/money';

/** The period's best sellers by units, with what they brought in. */
export function TopProductsTable({
  products,
  currency,
}: {
  products: BackendSalesAnalytics['topProducts'];
  currency: string;
}) {
  if (products.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No products sold in this period.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-muted-foreground border-b text-left text-xs">
          <th scope="col" className="py-2 font-medium">
            Product
          </th>
          <th scope="col" className="py-2 text-right font-medium">
            Sold
          </th>
          <th scope="col" className="py-2 text-right font-medium">
            Sales
          </th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {products.map((product) => (
          <tr key={product.productId}>
            <td className="max-w-0 truncate py-2 pr-3 font-medium">
              {product.productName}
            </td>
            <td className="py-2 text-right tabular-nums">{product.unitsSold}</td>
            <td className="py-2 pl-3 text-right tabular-nums">
              {formatMinor(product.grossAmount, currency)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
