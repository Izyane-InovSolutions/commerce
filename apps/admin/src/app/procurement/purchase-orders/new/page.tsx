import type { Metadata } from 'next';
import Link from 'next/link';

import { backendCurrencies } from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { PurchaseOrderForm } from '@/components/purchase-order-form';
import { Button } from '@/components/ui/button';
import { requireAdmin } from '@/lib/session';

import { createPurchaseOrderAction } from '../actions';
import { loadPurchaseOrderFormOptions } from '../form-options';

export const metadata: Metadata = { title: 'New purchase order' };

const DESCRIPTION =
  'Raise a draft. It can be changed freely until it is submitted for approval.';

export default async function NewPurchaseOrderPage() {
  await requireAdmin();

  let options;
  try {
    options = await loadPurchaseOrderFormOptions();
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="New purchase order" description={DESCRIPTION} />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  // Each of these makes the form impossible to complete, so say which one
  // rather than showing a form whose picker is empty.
  const missing =
    options.suppliers.length === 0
      ? {
          title: 'No active suppliers',
          description: 'A purchase order is raised against a supplier.',
          href: '/procurement/suppliers/new',
          label: 'Add a supplier',
        }
      : options.warehouses.length === 0
        ? {
            title: 'No active warehouses',
            description: 'A purchase order is delivered into a warehouse.',
            href: '/inventory',
            label: 'Open inventory',
          }
        : options.variants.length === 0
          ? {
              title: 'No variants to order',
              description: 'Each line orders a catalog variant.',
              href: '/catalog',
              label: 'Open the catalog',
            }
          : null;

  return (
    <div className="space-y-6">
      <PageHeader title="New purchase order" description={DESCRIPTION} />
      {missing ? (
        <EmptyState
          title={missing.title}
          description={missing.description}
          action={
            <Button asChild>
              <Link href={missing.href}>{missing.label}</Link>
            </Button>
          }
        />
      ) : (
        <PurchaseOrderForm
          action={createPurchaseOrderAction}
          suppliers={options.suppliers}
          warehouses={options.warehouses}
          variants={options.variants}
          currencies={backendCurrencies}
          cancelHref="/procurement"
        />
      )}
    </div>
  );
}
