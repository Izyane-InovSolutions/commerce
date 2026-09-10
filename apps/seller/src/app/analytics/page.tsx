import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Analytics',
};

export default function AnalyticsPage() {
  return (
    <SectionPlaceholder
      title="Analytics"
      description="Sales, conversion, and offer performance."
    />
  );
}
