import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata: Metadata = {
  title: 'Help & Support',
};

export default function HelpPage() {
  return (
    <PlaceholderPage
      title="Help & Support"
      description="Support articles and contact options for the marketplace."
    />
  );
}
