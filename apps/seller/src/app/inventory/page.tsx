import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Inventory',
};

export default function InventoryPage() {
  return (
    <SectionPlaceholder
      title="Inventory"
      description="Stock levels for the SKUs you sell, including reserved and available quantities."
    />
  );
}
