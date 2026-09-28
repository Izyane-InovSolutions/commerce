import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';
import { SupplierForm } from '@/components/supplier-form';
import { requireAdmin } from '@/lib/session';

import { createSupplierAction } from '../actions';

export const metadata: Metadata = { title: 'New supplier' };

export default async function NewSupplierPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <PageHeader
        title="New supplier"
        description="Add who you buy from. Purchase orders can name the supplier as soon as it exists."
      />
      <SupplierForm action={createSupplierAction} />
    </div>
  );
}
