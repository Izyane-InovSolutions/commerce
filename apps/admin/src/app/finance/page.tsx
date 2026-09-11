import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Finance',
};

export default function FinancePage() {
  return (
    <SectionPlaceholder
      title="Finance"
      description="Ledger entries, commissions, seller balances, and payouts. Balances are derived from auditable financial events."
    />
  );
}
