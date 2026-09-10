import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Payouts',
};

export default function PayoutsPage() {
  return (
    <SectionPlaceholder
      title="Payouts"
      description="Payout schedule, history, and settlement details."
    />
  );
}
