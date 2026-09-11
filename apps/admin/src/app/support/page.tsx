import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Support',
};

export default function SupportPage() {
  return (
    <SectionPlaceholder
      title="Support"
      description="Customer and seller support cases, including returns and disputes."
    />
  );
}
