import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Analytics' };

export default async function AnalyticsPage() {
  await requireUser();

  return (
    <AwaitingBackend
      title={'Analytics'}
      description={'Sales, conversion, and offer performance.'}
      needs={['GET /seller/insights']}
    />
  );
}
