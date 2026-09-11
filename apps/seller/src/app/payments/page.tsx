import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';
import { requireSeller } from '@/lib/session';

export const metadata: Metadata = { title: 'Payments' };

export default async function PaymentsPage() {
  await requireSeller();

  return (
    <SectionPlaceholder
      title="Payments"
      description="Your ledger-backed balance, commission and fees deducted, and payout history."
    />
  );
}
