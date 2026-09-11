import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Store Settings' };

export default async function SettingsPage() {
  await requireUser();

  return (
    <AwaitingBackend
      title={'Store Settings'}
      description={'Storefront details, policies, and account users.'}
      needs={['GET /sellers/me', 'PATCH /sellers/me']}
    />
  );
}
