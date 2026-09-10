import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Security',
};

export default function SecurityPage() {
  return (
    <SectionPlaceholder
      title="Security"
      description="Roles, permissions, and access controls."
    />
  );
}
