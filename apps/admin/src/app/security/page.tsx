import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Security' };

export default async function SecurityPage() {
  await requireAdmin();

  return (
    <AwaitingBackend
      title={'Security'}
      description={'Roles, permissions, and access controls.'}
      needs={['GET  /admin/users', 'PATCH /admin/users/:id/role']}
      note={
        'Roles are currently assigned directly in the database; there is no endpoint that grants one.'
      }
    />
  );
}
