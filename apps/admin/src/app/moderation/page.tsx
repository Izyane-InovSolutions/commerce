import type { Metadata } from 'next';

import { SectionPlaceholder } from '@/components/section-placeholder';

export const metadata: Metadata = {
  title: 'Moderation',
};

export default function ModerationPage() {
  return (
    <SectionPlaceholder
      title="Moderation"
      description="Review moderation and reported content."
    />
  );
}
