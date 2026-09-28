import { randomUUID } from 'node:crypto';

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  ApiError,
  backendGetPurchaseOrder,
  backendListProducts,
  backendListWarehouses,
} from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { PurchaseOrderReceiptForm } from '@/components/purchase-order-receipt-form';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';
import {
  outstandingQuantity,
  purchaseOrderActions,
  variantDirectory,
} from '@/lib/procurement';
import { requireAdmin } from '@/lib/session';

import { createGoodsReceiptAction } from '../../actions';

export async function generateMetadata({
  params,
}: PageProps<'/procurement/purchase-orders/[id]/receive'>): Promise<Metadata> {
  const { id } = await params;
  try {
    const po = await backendGetPurchaseOrder(apiClient, id);
    return { title: `Receive ${po.poNumber}` };
  } catch {
    return { title: 'Receive goods' };
  }
}

export default async function ReceivePurchaseOrderPage({
  params,
}: PageProps<'/procurement/purchase-orders/[id]/receive'>) {
  const viewer = await requireAdmin();
  const { id } = await params;
  const backHref = `/procurement/purchase-orders/${id}`;

  const back = (
    <div>
      <Button variant="ghost" size="sm" asChild>
        <Link href={backHref}>
          <ArrowLeft data-icon="inline-start" />
          Back to the purchase order
        </Link>
      </Button>
    </div>
  );

  let po;
  let warehouses;
  try {
    [po, warehouses] = await Promise.all([
      backendGetPurchaseOrder(apiClient, id),
      backendListWarehouses(apiClient),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return (
      <div className="space-y-6">
        {back}
        <PageHeader title="Receive goods" description="Record a delivery." />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const canReceive = purchaseOrderActions(po, viewer, {
    hasPostedReceipts: false,
  }).some((entry) => entry.action === 'receive');

  if (!canReceive) {
    return (
      <div className="space-y-6">
        {back}
        <PageHeader
          title={`Receive ${po.poNumber}`}
          description="Record a delivery against this purchase order."
        />
        <EmptyState
          title="Not open for receiving"
          description="Goods can only be received once the order has been placed with the supplier, and until everything has arrived or it is closed."
          action={
            <Button asChild>
              <Link href={backHref}>Back to the purchase order</Link>
            </Button>
          }
        />
      </div>
    );
  }

  // Names are a convenience; a catalog failure leaves SKUs as ids.
  let labels: Record<string, { product: string; sku: string }> = {};
  try {
    labels = Object.fromEntries(
      variantDirectory(await backendListProducts(apiClient)),
    );
  } catch {
    labels = {};
  }

  const canAuthorizeExcess = viewer.role === 'ADMIN';
  // Staff can only accept up to what is outstanding, so a fully received
  // line has nothing for them to enter; an administrator may over-receive
  // any line, so sees them all.
  const lines = canAuthorizeExcess
    ? po.lines
    : po.lines.filter((line) => outstandingQuantity(line) > 0);

  const warehouse = warehouses.find((entry) => entry.id === po.warehouseId);

  return (
    <div className="space-y-6">
      {back}
      <PageHeader
        title={`Receive ${po.poNumber}`}
        description="Count what arrived. Accepted units are posted into stock straight away and the order's received quantities move with them; a mistaken receipt is reversed afterwards, not edited."
      />
      <PurchaseOrderReceiptForm
        action={createGoodsReceiptAction.bind(null, po.id, randomUUID())}
        lines={lines}
        labels={labels}
        warehouseName={
          warehouse ? `${warehouse.name} (${warehouse.code})` : po.warehouseId
        }
        canAuthorizeExcess={canAuthorizeExcess}
        cancelHref={backHref}
      />
    </div>
  );
}
