import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Support' };

export default async function SupportPage() {
  await requireAdmin();

  return (
    <AwaitingBackend
      title={'Support'}
      description={'Customer and seller support cases.'}
      needs={['GET /admin/support/cases']}
    />
  );
}
