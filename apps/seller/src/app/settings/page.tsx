import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';
import { requireSeller } from '@/lib/session';

export const metadata: Metadata = { title: 'Store Settings' };

export default async function SettingsPage() {
  await requireSeller();

  return (
    <SectionPlaceholder
      title="Store Settings"
      description="Your storefront details, logo, policies, and the users on your seller account."
    />
  );
}
