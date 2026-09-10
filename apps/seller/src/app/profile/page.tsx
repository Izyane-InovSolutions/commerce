import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Profile',
};

export default function ProfilePage() {
  return (
    <SectionPlaceholder
      title="Profile"
      description="Storefront details, policies, and the users on your seller account."
    />
  );
}
