import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata: Metadata = {
  title: 'Account',
};

export default function AccountPage() {
  return (
    <PlaceholderPage
      title="Account"
      description="Sign-in, orders, addresses, and returns arrive with Phase 1, backed by the auth and users modules."
    />
  );
}
