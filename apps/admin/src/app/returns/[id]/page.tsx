import { randomUUID } from 'node:crypto';

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  ApiError,
  backendGetAdminOrder,
  backendGetReturn,
  backendListWarehouses,
} from '@commerce/api-client';
import type {
  BackendAdminOrderDetail,
  BackendAdminOrderItem,
  BackendWarehouse,
} from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { FulfillmentActionButton } from '@/components/fulfillment-action-button';
import { PageHeader } from '@/components/page-header';
import { ReturnFinalizeForm } from '@/components/return-finalize-form';
import { ReturnInspectionForm } from '@/components/return-inspection-form';
import { ReturnReceiptForm } from '@/components/return-receipt-form';
import { ReturnReviewForm } from '@/components/return-review-form';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import {
  acceptedSellerOrderIds,
  isRetryableRefundCase,
  readEvents,
  readInspections,
  readReceipts,
  readyToFinalize,
  RETURN_DISPOSITION_LABELS,
  RETURN_STATUS_HELP,
  returnItemProgress,
  returnSteps,
} from '@/lib/returns';
import { requireAdmin } from '@/lib/session';

import {
  approveReturnAction,
  finalizeInspectionAction,
  postInspectionAction,
  postReceiptAction,
  rejectReturnAction,
  retryRefundCaseAction,
} from '../actions';

export async function generateMetadata({
  params,
}: PageProps<'/returns/[id]'>): Promise<Metadata> {
  const { id } = await params;
  return { title: `Return ${id.slice(0, 8)}` };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function words(code: string): string {
  const text = code.toLowerCase().replace(/[_.]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "Product — Variant" and its SKU, from the names the admin order read joins
 * onto each line; a short id when the order could not be read.
 */
function describeOrderItem(
  orderItem: BackendAdminOrderItem | undefined,
  orderItemId: string,
): { title: string; detail: string } {
  if (!orderItem?.product) {
    return {
      title: `Order item ${orderItemId.slice(0, 8)}`,
      detail: orderItem ? `Offer ${orderItem.offerId.slice(0, 8)}` : '',
    };
  }
  const variantName = orderItem.variant?.name;
  return {
    title: variantName
      ? `${orderItem.product.name} — ${variantName}`
      : orderItem.product.name,
    detail: orderItem.variant?.skuCode ?? orderItem.sellerSku ?? '',
  };
}

/** The `to` status a STATUS_CHANGED event carries, when it carries one. */
function eventTarget(data: unknown): string | null {
  if (data && typeof data === 'object' && 'to' in data) {
    const to = (data as { to: unknown }).to;
    return typeof to === 'string' ? to : null;
  }
  return null;
}

export default async function ReturnPage({
  params,
}: PageProps<'/returns/[id]'>) {
  const user = await requireAdmin();
  const isAdmin = user.role === 'ADMIN';
  const { id } = await params;

  let request;
  try {
    request = await backendGetReturn(apiClient, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return (
      <div className="space-y-6">
        <PageHeader title="Return" description="Review, receipt, and refund." />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  // A return item names only its order item, so the product names — and
  // the customer — come from the order, which the admin read joins them
  // onto. Both reads are forgiving: failing one costs the labels (or the
  // warehouse picker), never the return itself.
  const [orderResult, warehousesResult] = await Promise.allSettled([
    backendGetAdminOrder(apiClient, request.orderId),
    backendListWarehouses(apiClient),
  ]);
  const order: BackendAdminOrderDetail | null =
    orderResult.status === 'fulfilled' ? orderResult.value : null;
  const warehouses: BackendWarehouse[] =
    warehousesResult.status === 'fulfilled' ? warehousesResult.value : [];

  const orderItems = new Map(
    (order?.items ?? []).map((item) => [item.id, item]),
  );
  const warehouseNames = new Map(
    warehouses.map((warehouse) => [warehouse.id, warehouse.name]),
  );
  const itemLabel = new Map(
    request.items.map((item) => [
      item.id,
      describeOrderItem(orderItems.get(item.orderItemId), item.orderItemId),
    ]),
  );
  const customer = order?.customer;
  const customerName = customer
    ? [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
      customer.email
    : null;

  const progress = returnItemProgress(request);
  const steps = new Set(returnSteps(request.status));
  const receipts = readReceipts(request);
  const inspections = readInspections(request);
  const events = readEvents(request);
  const currency = request.items[0]?.currency ?? order?.currency ?? 'ZMW';

  const sellerOrderIds = acceptedSellerOrderIds(
    request,
    progress,
    new Map((order?.items ?? []).map((item) => [item.id, item.sellerOrderId])),
  );
  const sellerOrders = new Map(
    (order?.sellerOrders ?? []).map((sellerOrder) => [
      sellerOrder.id,
      sellerOrder,
    ]),
  );

  const receiveItems = request.items
    .map((item) => ({
      id: item.id,
      title: itemLabel.get(item.id)?.title ?? item.id.slice(0, 8),
      detail: itemLabel.get(item.id)?.detail ?? '',
      toReceive: progress.get(item.id)?.toReceive ?? 0,
    }))
    .filter((item) => item.toReceive > 0);
  const inspectItems = request.items
    .map((item) => ({
      id: item.id,
      title: itemLabel.get(item.id)?.title ?? item.id.slice(0, 8),
      detail: itemLabel.get(item.id)?.detail ?? '',
      toInspect: progress.get(item.id)?.toInspect ?? 0,
    }))
    .filter((item) => item.toInspect > 0);

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/returns">
            <ArrowLeft data-icon="inline-start" />
            All returns
          </Link>
        </Button>
      </div>

      <PageHeader
        title={`Return ${request.rmaNumber ?? request.id.slice(0, 8)}`}
        description={RETURN_STATUS_HELP[request.status]}
        action={<StatusBadge status={request.status.toLowerCase()} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground text-xs">Order</dt>
              <dd>
                <Link
                  href={`/orders/${request.orderId}`}
                  className="font-mono hover:underline"
                >
                  {request.orderId.slice(0, 8)}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Requested</dt>
              <dd>{formatDate(request.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Customer</dt>
              {customer && customerName ? (
                <dd>
                  {customerName}
                  {customerName !== customer.email ? (
                    <span className="text-muted-foreground block text-xs">
                      {customer.email}
                    </span>
                  ) : null}
                </dd>
              ) : (
                <dd className="font-mono">{request.userId.slice(0, 8)}</dd>
              )}
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                Receiving warehouse
              </dt>
              <dd>
                {request.warehouseId
                  ? (warehouseNames.get(request.warehouseId) ??
                    request.warehouseId.slice(0, 8))
                  : 'Set on approval'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Assigned staff</dt>
              <dd className="font-mono">
                {request.assignedStaffId
                  ? request.assignedStaffId.slice(0, 8)
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">RMA</dt>
              <dd className="font-mono">{request.rmaNumber ?? '—'}</dd>
            </div>
          </dl>
          {request.rmaInstructions ? (
            <p className="text-muted-foreground text-sm text-pretty">
              {request.rmaInstructions}
            </p>
          ) : null}
          {request.rejectionReason ? (
            <p className="text-destructive text-sm">
              Rejected: {request.rejectionReason}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>
            Value is what the customer paid per unit. What is refunded is
            decided at inspection: only accepted units are.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Requested</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {request.items.map((item) => {
                  const label = itemLabel.get(item.id);
                  const itemProgress = progress.get(item.id);
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium">{label?.title}</p>
                        <p className="text-muted-foreground text-xs">
                          {label?.detail}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p>{words(item.reasonCode)}</p>
                        {item.note ? (
                          <p className="text-muted-foreground text-xs text-pretty">
                            {item.note}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {itemProgress?.received ?? 0}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {itemProgress?.accepted ?? 0}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {itemProgress?.rejected ?? 0}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinor(item.unitAmount, item.currency)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {steps.has('approve') ? (
        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>
              Approving issues an RMA number and fixes the warehouse the parcel
              goes to.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isAdmin ? (
              <ReturnReviewForm
                warehouses={warehouses
                  .filter((warehouse) => warehouse.isActive)
                  .map((warehouse) => ({
                    value: warehouse.id,
                    label: `${warehouse.name} (${warehouse.code})`,
                  }))}
                approve={approveReturnAction.bind(
                  null,
                  request.id,
                  request.version,
                )}
                reject={rejectReturnAction.bind(
                  null,
                  request.id,
                  request.version,
                )}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                An administrator approves or rejects returns.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {steps.has('receive') ? (
        <Card>
          <CardHeader>
            <CardTitle>Record receipt</CardTitle>
            <CardDescription>
              What arrived at{' '}
              {request.warehouseId
                ? (warehouseNames.get(request.warehouseId) ??
                  'the receiving warehouse')
                : 'the receiving warehouse'}
              . Staff can only post against returns assigned to them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {receiveItems.length > 0 ? (
              <ReturnReceiptForm
                items={receiveItems}
                idempotencyKey={randomUUID()}
                action={postReceiptAction.bind(null, request.id)}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                Every requested unit has been received, but no receipt was
                marked as the last one, so the return cannot move on to
                inspection from here. This needs fixing on the API side.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {steps.has('inspect') ? (
        <Card>
          <CardHeader>
            <CardTitle>Record inspection</CardTitle>
            <CardDescription>
              Decide every received unit. Accepted units are refunded when the
              return is finalized; rejected ones are not.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {inspectItems.length > 0 && request.warehouseId ? (
              <ReturnInspectionForm
                items={inspectItems}
                idempotencyKey={randomUUID()}
                action={postInspectionAction.bind(null, request.id)}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                Every received unit has been inspected.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {steps.has('finalize') ? (
        <Card>
          <CardHeader>
            <CardTitle>Finalize</CardTitle>
            <CardDescription>
              Raises one refund case per seller order with accepted units, and
              sends it to the payment gateway straight away. If nothing was
              accepted the return closes with no refund.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isAdmin ? (
              <ReturnFinalizeForm
                currency={currency}
                ready={readyToFinalize(progress)}
                sellerOrders={sellerOrderIds.map((sellerOrderId) => {
                  const shipping =
                    sellerOrders.get(sellerOrderId)?.shippingAmount;
                  return {
                    id: sellerOrderId,
                    label: `Seller order ${sellerOrderId.slice(0, 8)}`,
                    hint:
                      shipping === undefined
                        ? undefined
                        : `${formatMinor(shipping, currency)} shipping charged`,
                  };
                })}
                action={finalizeInspectionAction.bind(
                  null,
                  request.id,
                  sellerOrderIds,
                )}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                An administrator finalizes the inspection and raises the refund.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {request.refundCases.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Refund cases</CardTitle>
            <CardDescription>
              One per seller order. The payment gateway does not support refunds
              yet, so every case currently ends Failed — retrying sends it to
              the gateway again and will fail the same way until refunds are
              supported there. Any refund owed has to be settled with the
              customer by other means in the meantime.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Seller order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Shipping</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {request.refundCases.map((refundCase) => (
                    <TableRow key={refundCase.id}>
                      <TableCell className="font-mono text-xs">
                        {refundCase.sellerOrderId.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={refundCase.status.toLowerCase()} />
                        <p className="text-muted-foreground mt-1 text-xs">
                          Updated {formatDate(refundCase.updatedAt)}
                        </p>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs text-pretty">
                        {refundCase.reason}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinor(
                          refundCase.shippingAmount,
                          refundCase.currency,
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinor(refundCase.amount, refundCase.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {isAdmin && isRetryableRefundCase(refundCase) ? (
                          <FulfillmentActionButton
                            action={retryRefundCaseAction.bind(
                              null,
                              request.id,
                              refundCase.id,
                            )}
                            label="Retry refund"
                            pendingLabel="Retrying…"
                            variant="outline"
                          />
                        ) : refundCase.status === 'RECONCILIATION_REQUIRED' ? (
                          <span className="text-muted-foreground text-xs">
                            Needs reconciling with the gateway before a retry
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {receipts.length > 0 || inspections.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Receipts and inspections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {receipts.map((receipt) => (
              <div key={receipt.id} className="space-y-1 border-b pb-3 text-sm">
                <p className="font-medium">
                  Receipt · {formatDate(receipt.createdAt)}
                  {receipt.isClosing ? ' · last delivery' : ''}
                </p>
                <ul className="text-muted-foreground space-y-0.5">
                  {receipt.lines.map((line) => (
                    <li key={line.id}>
                      {line.quantity} ×{' '}
                      {itemLabel.get(line.returnItemId)?.title}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {inspections.map((inspection) => (
              <div
                key={inspection.id}
                className="space-y-1 border-b pb-3 text-sm"
              >
                <p className="font-medium">
                  Inspection · {formatDate(inspection.createdAt)}
                  {inspection.isFinal ? ' · final' : ''}
                </p>
                <ul className="text-muted-foreground space-y-0.5">
                  {inspection.lines.map((line) => (
                    <li key={line.id}>
                      {itemLabel.get(line.returnItemId)?.title}:{' '}
                      {line.acceptedQuantity > 0
                        ? `${line.acceptedQuantity} accepted${
                            line.disposition
                              ? ` (${RETURN_DISPOSITION_LABELS[line.disposition]})`
                              : ''
                          }`
                        : null}
                      {line.acceptedQuantity > 0 && line.rejectedQuantity > 0
                        ? ', '
                        : null}
                      {line.rejectedQuantity > 0
                        ? `${line.rejectedQuantity} rejected — ${line.rejectionReason ?? 'no reason given'}`
                        : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {events.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              {events.map((event) => {
                const target = eventTarget(event.data);
                return (
                  <li
                    key={event.id}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-2">
                      {words(event.type)}
                      {target ? (
                        <StatusBadge status={target.toLowerCase()} />
                      ) : null}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {formatDate(event.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
