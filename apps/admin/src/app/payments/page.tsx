import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Payments',
};

export default function PaymentsPage() {
  return (
    <SectionPlaceholder
      title="Payments"
      description="Payments, refunds, and reconciliation against the in-house gateway. Payment state is only ever trusted after server-side verification."
    />
  );
}
