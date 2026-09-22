import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Moderation' };

export default async function ModerationPage() {
  await requireAdmin();

  return (
    <AwaitingBackend
      title={'Moderation'}
      description={'Review moderation and reported content.'}
      needs={['GET /admin/reviews']}
    />
  );
}
