import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ApiError, getOffer, listInventory } from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { OfferForm } from '@/components/offer-form';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api';
import { requireSeller } from '@/lib/session';

import { updateOfferAction } from '../actions';

export async function generateMetadata({
  params,
}: PageProps<'/offers/[id]'>): Promise<Metadata> {
  const { id } = await params;
  try {
    const offer = await getOffer(apiClient, id);
    return { title: offer.productName };
  } catch {
    return { title: 'Offer' };
  }
}

export default async function OfferPage({ params }: PageProps<'/offers/[id]'>) {
  await requireSeller();
  const { id } = await params;

  let offer;
  let stock;
  try {
    offer = await getOffer(apiClient, id);
    stock = await listInventory(apiClient, { skuId: offer.skuId });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return <ApiErrorNotice error={error} />;
  }

  const updateAction = updateOfferAction.bind(null, offer.id);

  return (
    <div className="space-y-8">
      <PageHeader
        title={offer.productName}
        description={`${offer.variantName} · ${offer.skuCode}`}
        action={<StatusBadge status={offer.status} />}
      />

      <OfferForm action={updateAction} offer={offer} />

      <Card>
        <CardHeader>
          <CardTitle>Stock for this SKU</CardTitle>
          <CardDescription>
            Available is on-hand less what is already reserved against open
            orders.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stock.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No stock records for this SKU.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stock.items.map((level) => (
                    <TableRow key={level.locationId}>
                      <TableCell>{level.locationName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {level.onHand}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {level.reserved}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {level.available}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
