import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Audit' };

export default async function AuditPage() {
  await requireAdmin();

  return (
    <AwaitingBackend
      title={'Audit'}
      description={'Events raised by privileged actions.'}
      needs={['GET /admin/audit-events']}
      note={
        'Audit rows are being written — the module exists but is not imported into AppModule, so nothing is exposed over HTTP.'
      }
    />
  );
}
