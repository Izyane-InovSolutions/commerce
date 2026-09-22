import type { Metadata } from 'next';
import Link from 'next/link';

import {
  backendListSellerOffers,
  backendListSellerOrders,
} from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SellerGateNotice } from '@/components/seller-gate-notice';
import { StatusBadge } from '@/components/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { readParam } from '@/lib/search-params';
import { getSellerAccount } from '@/lib/seller';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Orders' };

const PAGE_SIZE = 20;
/** Enough to label the lines on a page; the API caps a page at 100. */
const OFFER_LOOKUP_LIMIT = 100;

const TITLE = 'Orders';
const DESCRIPTION = 'Orders placed against your listings.';

export default async function OrdersPage({
  searchParams,
}: PageProps<'/orders'>) {
  await requireUser();
  const account = await getSellerAccount();

  if (account.state !== 'approved') {
    return (
      <SellerGateNotice
        title={TITLE}
        description={DESCRIPTION}
        account={account}
      />
    );
  }

  const params = await searchParams;
  const requested = Number(readParam(params, 'page') ?? '1');
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;

  let orders;
  try {
    orders = await backendListSellerOrders(apiClient, {
      page,
      limit: PAGE_SIZE,
    });
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  // An order line names the offer it was bought from, never the product, so
  // the listings are read alongside purely to put titles on those lines.
  // Failing to label a line should not hide the order.
  let titles = new Map<string, string>();
  try {
    const offers = await backendListSellerOffers(apiClient, {
      limit: OFFER_LOOKUP_LIMIT,
    });
    titles = new Map(
      offers.items.map((offer) => [
        offer.id,
        offer.listingTitle ?? offer.sellerSku ?? 'Listing',
      ]),
    );
  } catch {
    titles = new Map();
  }

  const totalPages = Math.max(1, Math.ceil(orders.total / orders.limit));

  return (
    <div className="space-y-6">
      <PageHeader
        title={TITLE}
        description="Your share of each customer order. Open one to accept, pack, and dispatch whatever you ship yourself."
      />

      {orders.items.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="Orders appear here once a customer buys one of your published listings."
        />
      ) : (
        <div className="space-y-4">
          {orders.items.map((order) => (
            <div key={order.id} className="rounded-xl border">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div>
                  <Link
                    href={`/orders/${order.id}`}
                    className="font-mono text-xs hover:underline"
                  >
                    {order.orderId.slice(0, 8)}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {new Date(order.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {order.refundedAmount > 0 ? (
                    <span className="text-muted-foreground text-xs">
                      {formatMinor(order.refundedAmount, order.currency)}{' '}
                      refunded
                    </span>
                  ) : null}
                  <span className="font-medium tabular-nums">
                    {formatMinor(order.total, order.currency)}
                  </span>
                  <StatusBadge
                    status={order.status.toLowerCase().replace(/_/g, ' ')}
                  />
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit</TableHead>
                    <TableHead className="text-right">Line total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {titles.get(item.offerId) ?? (
                          <span className="font-mono text-xs">
                            {item.offerId.slice(0, 8)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinor(item.unitAmount, item.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinor(item.lineTotal, item.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      )}

      <Pagination
        pathname="/orders"
        params={params}
        page={orders.page}
        pageSize={orders.limit}
        total={orders.total}
        totalPages={totalPages}
      />
    </div>
  );
}
