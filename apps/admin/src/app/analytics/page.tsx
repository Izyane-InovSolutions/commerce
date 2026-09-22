import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Analytics' };

export default async function AnalyticsPage() {
  await requireAdmin();

  return (
    <AwaitingBackend
      title={'Analytics'}
      description={'Trading and marketplace reporting.'}
      needs={['GET /admin/insights']}
      note={
        'The dashboard shows what can be counted from the catalog and inventory endpoints today.'
      }
    />
  );
}
