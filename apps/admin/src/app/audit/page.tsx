import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Audit',
};

export default function AuditPage() {
  return (
    <SectionPlaceholder
      title="Audit"
      description="Audit events raised by privileged actions."
    />
  );
}
