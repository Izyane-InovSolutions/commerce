import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  ApiError,
  backendGetPurchaseOrder,
  backendGetSupplier,
} from '@commerce/api-client';
import { backendCurrencies } from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { PurchaseOrderForm } from '@/components/purchase-order-form';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';
import { requireAdmin } from '@/lib/session';

import { updatePurchaseOrderAction } from '../../actions';
import { loadPurchaseOrderFormOptions } from '../../form-options';

export async function generateMetadata({
  params,
}: PageProps<'/procurement/purchase-orders/[id]/edit'>): Promise<Metadata> {
  const { id } = await params;
  try {
    const po = await backendGetPurchaseOrder(apiClient, id);
    return { title: `Edit ${po.poNumber}` };
  } catch {
    return { title: 'Edit purchase order' };
  }
}

export default async function EditPurchaseOrderPage({
  params,
}: PageProps<'/procurement/purchase-orders/[id]/edit'>) {
  await requireAdmin();
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
  let options;
  try {
    po = await backendGetPurchaseOrder(apiClient, id);
    // The draft's own supplier stays choosable even if it has since been
    // deactivated, so the picker shows what the order actually names.
    const supplier = await backendGetSupplier(apiClient, po.supplierId);
    options = await loadPurchaseOrderFormOptions({
      supplier,
      warehouseId: po.warehouseId,
      variantIds: po.lines.map((line) => line.variantId),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return (
      <div className="space-y-6">
        {back}
        <PageHeader title="Edit purchase order" description="Change a draft." />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  if (po.status !== 'DRAFT') {
    return (
      <div className="space-y-6">
        {back}
        <PageHeader
          title={`Edit ${po.poNumber}`}
          description="Change a draft."
        />
        <EmptyState
          title="No longer a draft"
          description="Only a draft can be edited. A submitted order can be returned to draft; an approved or ordered one is changed by creating a revision."
          action={
            <Button asChild>
              <Link href={backHref}>Back to the purchase order</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {back}
      <PageHeader
        title={`Edit ${po.poNumber}`}
        description="Saving replaces every line with the ones below and recalculates the totals."
      />
      <PurchaseOrderForm
        action={updatePurchaseOrderAction.bind(null, {
          id: po.id,
          version: po.version,
          supplierId: po.supplierId,
          warehouseId: po.warehouseId,
        })}
        suppliers={options.suppliers}
        warehouses={options.warehouses}
        variants={options.variants}
        currencies={backendCurrencies}
        purchaseOrder={po}
        cancelHref={backHref}
      />
    </div>
  );
}
