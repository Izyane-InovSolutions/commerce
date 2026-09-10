import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Inventory',
};

export default function InventoryPage() {
  return (
    <SectionPlaceholder
      title="Inventory"
      description="On-hand, reserved, available, damaged, and in-transit stock by location."
    />
  );
}
