import type { Metadata } from 'next';
import Link from 'next/link';

import { backendListSellerInventory } from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { SellerGateNotice } from '@/components/seller-gate-notice';
import { SetInventoryForm } from '@/components/set-inventory-form';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api';
import { getSellerAccount } from '@/lib/seller';
import { requireUser } from '@/lib/session';

import { setInventoryAction } from './actions';

export const metadata: Metadata = { title: 'Inventory' };

const TITLE = 'Inventory';
const DESCRIPTION =
  'The stock you hold, for listings where you ship it yourself. A platform-fulfilled listing has no row here — its stock is a warehouse’s to manage.';

export default async function InventoryPage() {
  await requireUser();
  const account = await getSellerAccount();

  if (account.state !== 'approved') {
    return (
      <SellerGateNotice title={TITLE} description={DESCRIPTION} account={account} />
    );
  }

  let records;
  try {
    records = await backendListSellerInventory(apiClient);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={TITLE} description={DESCRIPTION} />

      {records.length === 0 ? (
        <EmptyState
          title="Nothing to stock yet"
          description="This only lists offers set to manage their own stock. Create one, or switch an existing listing to self-managed stock, to start counting it here."
          action={
            <Button asChild>
              <Link href="/products/new">List a product</Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Listing</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Set stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.offerId}>
                  <TableCell>
                    <Link
                      href={`/products/${record.offerId}`}
                      className="font-medium hover:underline"
                    >
                      {record.listingTitle ?? 'Untitled listing'}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {record.sellerSku ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {record.onHand}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {record.reserved}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {record.available}
                  </TableCell>
                  <TableCell>
                    <SetInventoryForm
                      offerId={record.offerId}
                      version={record.version}
                      label={record.sellerSku ?? record.listingTitle ?? record.offerId}
                      action={setInventoryAction}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
