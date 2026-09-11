import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata: Metadata = {
  title: 'Help & Support',
};

export default function HelpPage() {
  return (
    <PlaceholderPage
      title="Help & Support"
      description="Support articles and contact options are not part of the Commerce API; this page is waiting on a content source rather than an endpoint."
    />
  );
}
