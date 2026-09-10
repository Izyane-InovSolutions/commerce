import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Earnings',
};

export default function EarningsPage() {
  return (
    <SectionPlaceholder
      title="Earnings"
      description="Commission, fees, and your ledger-backed balance."
    />
  );
}
