import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';
import { requireSeller } from '@/lib/session';

export const metadata: Metadata = { title: 'Analytics' };

export default async function AnalyticsPage() {
  await requireSeller();

  return (
    <SectionPlaceholder
      title="Analytics"
      description="Sales, conversion, and how each of your offers performs."
    />
  );
}
