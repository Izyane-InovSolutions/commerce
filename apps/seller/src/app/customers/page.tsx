import type { Metadata } from 'next';

import { AwaitingBackend } from '@/components/awaiting-backend';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Customers' };

export default async function CustomersPage() {
  await requireUser();

  return (
    <AwaitingBackend
      title={'Customers'}
      description={'People who have bought from you.'}
      needs={['GET /seller/customers']}
    />
  );
}
