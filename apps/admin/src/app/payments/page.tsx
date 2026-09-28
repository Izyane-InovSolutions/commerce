import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import {
  backendGetAdminOrder,
  backendListGatewayPayments,
} from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { ReconcileRefundForm, RefundForm } from '@/components/refund-forms';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api';
import { explainMissingRoute } from '@/lib/api-route-errors';
import { formatMinor } from '@/lib/money';
import {
  formatGatewayAmount,
  isUuid,
  readGatewayPaymentQuery,
  refundableAmount,
} from '@/lib/payments';
import {
  readParam,
  withParams,
  type RawSearchParams,
} from '@/lib/search-params';
import { requireAdmin } from '@/lib/session';

import {
  reconcileRefundAction,
  refundPaymentAction,
  refundSellerOrderAction,
} from './actions';

export const metadata: Metadata = { title: 'Payments' };

function formatDateTime(value: string | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The gateway's own list of payments, newest first.
 *
 * It is the gateway's record, not the platform's — the id is the gateway's
 * and the reference is the order id the platform sent — so each row links to
 * its order and to the refund lookup for it, rather than to a payment page
 * the platform does not have.
 */
async function GatewayPayments({ params }: { params: RawSearchParams }) {
  const query = readGatewayPaymentQuery(params);

  let payments;
  try {
    payments = await backendListGatewayPayments(apiClient, query);
  } catch (error) {
    return (
      <ApiErrorNotice error={explainMissingRoute(error, 'gateway payments')} />
    );
  }

  if (payments.content.length === 0) {
    return (
      <EmptyState
        title={query.page > 0 ? 'No payments on this page' : 'No payments yet'}
        description={
          query.page > 0
            ? 'The gateway has fewer payments than this page would start at.'
            : 'Payments appear here once a customer starts checkout and the gateway records them.'
        }
        action={
          query.page > 0 ? (
            <Button asChild>
              <Link href="/payments">First page</Link>
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Completed</TableHead>
              <TableHead>Gateway id</TableHead>
              <TableHead>
                <span className="sr-only">Refund</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.content.map((payment) => (
              <TableRow key={payment.paymentId}>
                <TableCell>
                  {isUuid(payment.reference) ? (
                    <Link
                      href={`/orders/${payment.reference}`}
                      className="font-mono text-xs font-medium hover:underline"
                    >
                      {payment.reference.slice(0, 8)}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs">
                      {payment.reference}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <StatusBadge status={payment.status.toLowerCase()} />
                    {payment.failureMessage ? (
                      <p className="text-muted-foreground max-w-xs text-xs text-pretty">
                        {payment.failureMessage}
                      </p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatGatewayAmount(payment.amount, payment.currency)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {payment.completedAt
                    ? formatDateTime(payment.completedAt)
                    : payment.expiresAt
                      ? `Expires ${formatDateTime(payment.expiresAt)}`
                      : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {payment.paymentId}
                </TableCell>
                <TableCell className="text-right">
                  {isUuid(payment.reference) ? (
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        href={`${withParams('/payments', params, {
                          order: payment.reference,
                        })}#refunds`}
                      >
                        Refund…
                      </Link>
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Pagination
        pathname="/payments"
        params={params}
        page={payments.page + 1}
        pageSize={payments.size}
        total={payments.totalElements}
        totalPages={Math.max(1, payments.totalPages)}
      />
    </div>
  );
}

/**
 * Refund forms for one order: one per seller order — the refund the platform
 * actually books — and the payment-level one, which the API refuses today.
 *
 * Each refund action gets its idempotency key bound here, one per render, so
 * a retry of the same submission is deduplicated by the API and a successful
 * one (which revalidates this page) moves on to a fresh key.
 */
async function OrderRefunds({ orderId }: { orderId: string }) {
  let order;
  try {
    order = await backendGetAdminOrder(apiClient, orderId);
  } catch (error) {
    return <ApiErrorNotice error={error} />;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Order{' '}
        <Link
          href={`/orders/${order.id}`}
          className="font-mono font-medium hover:underline"
        >
          {order.id}
        </Link>{' '}
        — {formatMinor(order.total, order.currency)},{' '}
        <StatusBadge status={order.status.toLowerCase()} />
        {order.payment ? (
          <>
            {' '}
            payment <StatusBadge status={order.payment.status.toLowerCase()} />
          </>
        ) : null}
      </p>

      {order.sellerOrders.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          This order has no seller orders, so there is nothing to refund
          against.
        </p>
      ) : (
        order.sellerOrders.map((sellerOrder) => {
          const refundable = refundableAmount(sellerOrder);
          return (
            <div
              key={sellerOrder.id}
              className="bg-muted/40 space-y-3 rounded-lg border p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-medium">
                    Seller order {sellerOrder.id.slice(0, 8)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatMinor(sellerOrder.total, sellerOrder.currency)}{' '}
                    total,{' '}
                    {formatMinor(
                      sellerOrder.refundedAmount,
                      sellerOrder.currency,
                    )}{' '}
                    refunded so far
                  </p>
                </div>
                <StatusBadge status={sellerOrder.status.toLowerCase()} />
              </div>
              {refundable > 0 ? (
                <RefundForm
                  action={refundSellerOrderAction.bind(null, randomUUID())}
                  targetId={sellerOrder.id}
                  amountHint={`Up to ${formatMinor(refundable, sellerOrder.currency)}.`}
                  submitLabel="Refund seller order"
                />
              ) : (
                <p className="text-muted-foreground text-sm">Fully refunded.</p>
              )}
            </div>
          );
        })
      )}

      {order.payment ? (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Refund the whole payment instead
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-muted-foreground text-sm text-pretty">
              The API checks the payment and then refuses this with “not
              implemented”: a payment-level refund would move money without the
              order and seller-ledger records that account for it. Refund each
              seller order above instead.
            </p>
            <RefundForm
              action={refundPaymentAction.bind(null, randomUUID())}
              targetId={order.payment.id}
              amountHint={`Up to ${formatMinor(order.total, order.currency)}.`}
              submitLabel="Refund payment"
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}

export default async function PaymentsPage({
  searchParams,
}: PageProps<'/payments'>) {
  await requireAdmin(true);
  const params = await searchParams;

  const orderParam = readParam(params, 'order')?.trim();
  const orderId =
    orderParam !== undefined && isUuid(orderParam) ? orderParam : undefined;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Payments"
        description="Payments as the gateway records them, and refunds against the orders they paid for."
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Gateway payments
        </h2>
        <Suspense fallback={null}>
          <GatewayPayments params={params} />
        </Suspense>
      </section>

      <section id="refunds" className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Refunds</h2>
        <p
          role="note"
          className="bg-muted/40 text-muted-foreground max-w-3xl rounded-lg border px-4 py-3 text-sm text-pretty"
        >
          Refunds depend on the payment gateway supporting them, and the current
          gateway connectors do not yet. A refund recorded here opens a refund
          case against the seller order, but until the gateway can refund, its
          attempt comes back failed or refused — the API’s own message is shown
          when it is.
        </p>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Refund an order</CardTitle>
              <CardDescription>
                Refunds are booked per seller order, so each seller’s ledger is
                debited for its own share. Look an order up by id, or use Refund
                on a payment above.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form
                action="/payments#refunds"
                className="flex flex-wrap items-end gap-2"
              >
                <div className="min-w-72 flex-1 space-y-1.5">
                  <Label htmlFor="refund-order">Order id</Label>
                  <Input
                    id="refund-order"
                    name="order"
                    defaultValue={orderParam ?? ''}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                  />
                </div>
                <Button type="submit" variant="secondary">
                  Look up
                </Button>
                {orderParam !== undefined ? (
                  <Button variant="ghost" asChild>
                    <Link
                      href={withParams('/payments', params, {
                        order: undefined,
                      })}
                    >
                      Clear
                    </Link>
                  </Button>
                ) : null}
              </form>

              {orderParam !== undefined && orderId === undefined ? (
                <p role="alert" className="text-destructive text-sm">
                  That is not an order id — paste it as the order page shows it.
                </p>
              ) : null}

              {orderId !== undefined ? (
                <Suspense fallback={null}>
                  <OrderRefunds orderId={orderId} />
                </Suspense>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reconcile a refund</CardTitle>
              <CardDescription>
                Asks the provider again about a refund attempt still in flight
                and applies its answer to the refund case. A settled attempt
                comes back unchanged.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReconcileRefundForm action={reconcileRefundAction} />
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
