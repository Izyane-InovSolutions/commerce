import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';
import { requireSeller } from '@/lib/session';

export const metadata: Metadata = { title: 'Orders' };

export default async function OrdersPage() {
  await requireSeller();

  return (
    <SectionPlaceholder
      title="Orders"
      description="Orders placed against your offers, with fulfillment and returns. Not built yet — the orders domain is the next slice of work."
    />
  );
}
