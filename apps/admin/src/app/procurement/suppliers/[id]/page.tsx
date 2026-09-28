import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  ApiError,
  backendGetSupplier,
  backendListPurchaseOrders,
} from '@commerce/api-client';
import type { BackendPurchaseOrder } from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { SupplierDeactivateForm } from '@/components/supplier-deactivate-form';
import { SupplierForm } from '@/components/supplier-form';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { requireAdmin } from '@/lib/session';

import { deactivateSupplierAction, updateSupplierAction } from '../actions';

const RECENT_ORDERS = 5;

export async function generateMetadata({
  params,
}: PageProps<'/procurement/suppliers/[id]'>): Promise<Metadata> {
  const { id } = await params;
  try {
    const supplier = await backendGetSupplier(apiClient, id);
    return { title: supplier.tradingName || supplier.legalName };
  } catch {
    return { title: 'Supplier' };
  }
}

export default async function SupplierPage({
  params,
}: PageProps<'/procurement/suppliers/[id]'>) {
  await requireAdmin();
  const { id } = await params;

  let supplier;
  try {
    supplier = await backendGetSupplier(apiClient, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    return (
      <div className="space-y-6">
        <PageHeader title="Supplier" description="Details and terms." />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  // The order history is a convenience beside the edit form, so a failure
  // here hides the list rather than the supplier.
  let recent: { items: BackendPurchaseOrder[]; total: number } | null = null;
  try {
    recent = await backendListPurchaseOrders(apiClient, {
      supplierId: supplier.id,
      limit: RECENT_ORDERS,
    });
  } catch {
    recent = null;
  }

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/procurement/suppliers">
            <ArrowLeft data-icon="inline-start" />
            All suppliers
          </Link>
        </Button>
      </div>

      <PageHeader
        title={supplier.tradingName || supplier.legalName}
        description={
          supplier.tradingName && supplier.tradingName !== supplier.legalName
            ? `Trading as ${supplier.tradingName}; legally ${supplier.legalName}.`
            : `Supplier ${supplier.code}.`
        }
        action={<StatusBadge status={supplier.status.toLowerCase()} />}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SupplierForm
          supplier={supplier}
          action={updateSupplierAction.bind(null, {
            id: supplier.id,
            version: supplier.version,
            defaultCurrency: supplier.defaultCurrency,
          })}
        />

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Purchase orders</CardTitle>
              <CardDescription>
                {recent === null
                  ? 'Could not load this supplier’s purchase orders.'
                  : recent.total === 0
                    ? 'None raised against this supplier yet.'
                    : `${recent.total} raised against this supplier.`}
              </CardDescription>
            </CardHeader>
            {recent && recent.items.length > 0 ? (
              <CardContent className="space-y-2 text-sm">
                <ul className="space-y-2">
                  {recent.items.map((po) => (
                    <li
                      key={po.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <Link
                        href={`/procurement/purchase-orders/${po.id}`}
                        className="font-mono hover:underline"
                      >
                        {po.poNumber}
                      </Link>
                      <span className="text-muted-foreground tabular-nums">
                        {formatMinor(po.totalAmount, po.currency)}
                      </span>
                      <StatusBadge status={po.status.toLowerCase()} />
                    </li>
                  ))}
                </ul>
                {recent.total > recent.items.length ? (
                  <Button variant="link" size="sm" className="px-0" asChild>
                    <Link href={`/procurement?supplierId=${supplier.id}`}>
                      See all {recent.total}
                    </Link>
                  </Button>
                ) : null}
              </CardContent>
            ) : null}
          </Card>

          {supplier.status === 'ACTIVE' ? (
            <Card>
              <CardHeader>
                <CardTitle>Deactivate</CardTitle>
                <CardDescription>
                  Stops new purchase orders naming this supplier. Open orders
                  against it carry on as they are.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SupplierDeactivateForm
                  action={deactivateSupplierAction.bind(
                    null,
                    supplier.id,
                    supplier.version,
                  )}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Inactive</CardTitle>
                <CardDescription>
                  New purchase orders can&apos;t name this supplier. The API has
                  no way to reactivate one.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
