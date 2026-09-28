import { randomUUID } from 'node:crypto';

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  ApiError,
  backendGetPurchaseOrder,
  backendGetSupplier,
  backendListGoodsReceipts,
  backendListProducts,
  backendListWarehouses,
} from '@commerce/api-client';
import type {
  BackendGoodsReceipt,
  BackendSupplier,
  BackendWarehouse,
} from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { FulfillmentActionButton } from '@/components/fulfillment-action-button';
import { PageHeader } from '@/components/page-header';
import {
  PurchaseOrderActions,
  PurchaseOrderReasonForm,
} from '@/components/purchase-order-actions';
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
  basisPointsToPercent,
  outstandingQuantity,
  purchaseOrderActions,
  receiptProgress,
  variantDirectory,
  type VariantEntry,
} from '@/lib/procurement';
import { requireAdmin } from '@/lib/session';

import {
  discardGoodsReceiptAction,
  postGoodsReceiptAction,
  reverseGoodsReceiptAction,
  revisePurchaseOrderAction,
  transitionPurchaseOrderAction,
} from '../actions';

export async function generateMetadata({
  params,
}: PageProps<'/procurement/purchase-orders/[id]'>): Promise<Metadata> {
  const { id } = await params;
  try {
    return { title: (await backendGetPurchaseOrder(apiClient, id)).poNumber };
  } catch {
    return { title: 'Purchase order' };
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function PurchaseOrderPage({
  params,
}: PageProps<'/procurement/purchase-orders/[id]'>) {
  const viewer = await requireAdmin();
  const { id } = await params;

  const back = (
    <div>
      <Button variant="ghost" size="sm" asChild>
        <Link href="/procurement">
          <ArrowLeft data-icon="inline-start" />
          All purchase orders
        </Link>
      </Button>
    </div>
  );

  let po;
  try {
    po = await backendGetPurchaseOrder(apiClient, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return (
      <div className="space-y-6">
        {back}
        <PageHeader
          title="Purchase order"
          description="Lines, approvals, and receipts."
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  // Receipts decide whether cancelling is still allowed, so their failure is
  // shown rather than swallowed; the names around them are only labels.
  let receipts: BackendGoodsReceipt[] = [];
  let receiptsError: unknown = null;
  try {
    receipts = await backendListGoodsReceipts(apiClient, po.id);
  } catch (error) {
    receiptsError = error;
  }

  let supplier: BackendSupplier | null = null;
  let warehouse: BackendWarehouse | undefined;
  let variants = new Map<string, VariantEntry>();
  try {
    const [supplierResult, warehouses, products] = await Promise.all([
      backendGetSupplier(apiClient, po.supplierId),
      backendListWarehouses(apiClient),
      backendListProducts(apiClient),
    ]);
    supplier = supplierResult;
    warehouse = warehouses.find((entry) => entry.id === po.warehouseId);
    variants = variantDirectory(products);
  } catch {
    supplier = null;
  }

  // Mirrors the API's cancel check, which counts any posted receipt —
  // including one that reverses another.
  const hasPostedReceipts = receipts.some(
    (receipt) => receipt.status === 'POSTED',
  );
  const actions = purchaseOrderActions(po, viewer, { hasPostedReceipts });
  const progress = receiptProgress(po.lines);
  const money = (amount: number) => formatMinor(amount, po.currency);
  const lineLabels = new Map(
    po.lines.map((line) => {
      const entry = variants.get(line.variantId);
      return [
        line.id,
        entry ? `${entry.product} — ${entry.sku}` : line.variantId,
      ];
    }),
  );
  const receiptNumbers = new Map(
    receipts.map((receipt) => [receipt.id, receipt.receiptNumber]),
  );

  const supplierName = supplier
    ? supplier.tradingName || supplier.legalName
    : 'Supplier';

  const timeline: { label: string; value: string | null }[] = [
    { label: 'Created', value: po.createdAt },
    { label: 'Submitted', value: po.submittedAt },
    { label: 'Approved', value: po.approvedAt },
    { label: 'Ordered', value: po.orderedAt },
    { label: 'Completed', value: po.completedAt },
  ];

  const reasons: { label: string; value: string | null }[] = [
    { label: 'Rejected because', value: po.rejectionReason },
    { label: 'Cancelled because', value: po.cancellationReason },
    { label: 'Closed short because', value: po.shortCloseReason },
  ];

  return (
    <div className="space-y-8">
      {back}

      <PageHeader
        title={po.poNumber}
        description={`${supplierName}, delivering to ${warehouse?.name ?? 'its warehouse'}. ${progress.received} of ${progress.ordered} received${progress.cancelled > 0 ? `, ${progress.cancelled} cancelled` : ''}.`}
        action={<StatusBadge status={po.status.toLowerCase()} />}
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              {po.revisionNumber > 0 && po.supersedesId ? (
                <>
                  Revision {po.revisionNumber} of{' '}
                  <Link
                    href={`/procurement/purchase-orders/${po.supersedesId}`}
                    className="underline"
                  >
                    an earlier order
                  </Link>
                  , which stays in force until someone cancels it.
                </>
              ) : (
                'Costs are fixed as they were when each line was saved.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground text-xs">Supplier</dt>
                <dd>
                  <Link
                    href={`/procurement/suppliers/${po.supplierId}`}
                    className="hover:underline"
                  >
                    {supplier
                      ? `${supplierName} (${supplier.code})`
                      : po.supplierId}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Deliver to</dt>
                <dd>
                  {warehouse
                    ? `${warehouse.name} (${warehouse.code})`
                    : po.warehouseId}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">
                  Expected delivery
                </dt>
                <dd>
                  {po.expectedDeliveryDate
                    ? formatDate(po.expectedDeliveryDate)
                    : 'Not set'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Currency</dt>
                <dd>{po.currency}</dd>
              </div>
              {timeline
                .filter((entry) => entry.value)
                .map((entry) => (
                  <div key={entry.label}>
                    <dt className="text-muted-foreground text-xs">
                      {entry.label}
                    </dt>
                    <dd>{formatDateTime(entry.value!)}</dd>
                  </div>
                ))}
            </dl>

            {reasons
              .filter((entry) => entry.value)
              .map((entry) => (
                <div key={entry.label}>
                  <p className="text-muted-foreground text-xs">{entry.label}</p>
                  <p className="text-pretty">{entry.value}</p>
                </div>
              ))}

            {po.notes ? (
              <div>
                <p className="text-muted-foreground text-xs">Notes</p>
                <p className="whitespace-pre-line text-pretty">{po.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next steps</CardTitle>
            <CardDescription>
              Only what this status allows is offered. Each step is checked
              against the version on screen, so if someone else acted first
              you&apos;ll be asked to reload.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PurchaseOrderActions
              actions={actions}
              transition={transitionPurchaseOrderAction.bind(null, {
                id: po.id,
                version: po.version,
              })}
              revise={revisePurchaseOrderAction.bind(null, po.id)}
              editHref={`/procurement/purchase-orders/${po.id}/edit`}
              receiveHref={`/procurement/purchase-orders/${po.id}/receive`}
            />
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Lines</h2>
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Cancelled</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Line total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.lines.map((line) => {
                const entry = variants.get(line.variantId);
                return (
                  <TableRow key={line.id}>
                    <TableCell>
                      <span className="font-medium">
                        {entry?.product ?? 'Unnamed product'}
                      </span>
                      <p className="text-muted-foreground font-mono text-xs">
                        {entry?.sku ?? line.variantId}
                        {line.supplierSku ? ` · ${line.supplierSku}` : ''}
                        {line.packSize > 1
                          ? ` · packs of ${line.packSize}`
                          : ''}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {line.orderedQuantity}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {line.receivedQuantity}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {line.cancelledQuantity}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {outstandingQuantity(line)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(line.unitCostAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {line.discountAmount === 0
                        ? '—'
                        : money(line.discountAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(line.taxAmount)}
                      <p className="text-muted-foreground text-xs">
                        {basisPointsToPercent(line.taxRateBasisPoints)}%
                      </p>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {money(line.grossAmount)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <dl className="ml-auto grid max-w-xs grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="text-right">{money(po.subtotalAmount)}</dd>
          <dt className="text-muted-foreground">Tax</dt>
          <dd className="text-right">{money(po.taxAmount)}</dd>
          <dt className="text-muted-foreground">Shipping</dt>
          <dd className="text-right">{money(po.shippingAmount)}</dd>
          <dt className="font-medium">Total</dt>
          <dd className="text-right font-medium">{money(po.totalAmount)}</dd>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Goods receipts</h2>
        {receiptsError ? (
          <ApiErrorNotice error={receiptsError} />
        ) : receipts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing has been received against this order yet.
          </p>
        ) : (
          <div className="space-y-4">
            {receipts.map((receipt) => (
              <Card key={receipt.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="font-mono">
                      {receipt.receiptNumber}
                    </CardTitle>
                    <StatusBadge status={receipt.status.toLowerCase()} />
                  </div>
                  <CardDescription>
                    {receipt.reversalOfId
                      ? `Reverses ${receiptNumbers.get(receipt.reversalOfId) ?? 'an earlier receipt'}${receipt.reversalReason ? ` — ${receipt.reversalReason}` : ''}. `
                      : null}
                    {receipt.postedAt
                      ? `Posted ${formatDateTime(receipt.postedAt)}`
                      : `Saved ${formatDateTime(receipt.createdAt)}, not yet posted`}
                    {receipt.supplierDeliveryNoteRef
                      ? ` · delivery note ${receipt.supplierDeliveryNoteRef}`
                      : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Line</TableHead>
                          <TableHead className="text-right">
                            Delivered
                          </TableHead>
                          <TableHead className="text-right">Accepted</TableHead>
                          <TableHead className="text-right">Rejected</TableHead>
                          <TableHead className="text-right">Damaged</TableHead>
                          <TableHead>Discrepancy</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receipt.lines.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell>
                              {lineLabels.get(line.purchaseOrderLineId) ??
                                line.purchaseOrderLineId}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {line.deliveredQuantity}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {line.acceptedQuantity}
                              {line.authorizedExcessQty > 0 ? (
                                <p className="text-muted-foreground text-xs">
                                  {line.authorizedExcessQty} over, authorized
                                </p>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {line.rejectedQuantity}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {line.damagedQuantity}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-pretty">
                              {line.discrepancyReason ?? '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {receipt.status === 'DRAFT' ? (
                    <div className="flex flex-wrap items-start gap-2">
                      <FulfillmentActionButton
                        label="Post into stock"
                        pendingLabel="Posting…"
                        action={postGoodsReceiptAction.bind(
                          null,
                          po.id,
                          receipt.id,
                          randomUUID(),
                        )}
                      />
                      <FulfillmentActionButton
                        label="Discard draft"
                        pendingLabel="Discarding…"
                        variant="outline"
                        action={discardGoodsReceiptAction.bind(
                          null,
                          po.id,
                          receipt.id,
                        )}
                      />
                    </div>
                  ) : null}

                  {receipt.status === 'POSTED' &&
                  !receipt.reversalOfId &&
                  viewer.role === 'ADMIN' ? (
                    <PurchaseOrderReasonForm
                      id={`reverse-${receipt.id}`}
                      label="Reverse receipt"
                      prompt="Takes the accepted units back out of stock and reopens them on the order. The receipt itself stays on record, marked reversed."
                      action={reverseGoodsReceiptAction.bind(
                        null,
                        po.id,
                        receipt.id,
                      )}
                    />
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
