import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';
import { requireSeller } from '@/lib/session';

export const metadata: Metadata = { title: 'Customers' };

export default async function CustomersPage() {
  await requireSeller();

  return (
    <SectionPlaceholder
      title="Customers"
      description="People who have bought from you, derived from your orders. Arrives with the orders domain."
    />
  );
}
