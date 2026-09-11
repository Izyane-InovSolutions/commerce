import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata: Metadata = {
  title: 'My Wishlist',
};

export default function WishlistPage() {
  return (
    <PlaceholderPage
      title="My Wishlist"
      description="Save products for later. Arrives with Phase 1, backed by the auth and users modules."
    />
  );
}
