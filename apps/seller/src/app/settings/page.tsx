import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';
import { SellerGateNotice } from '@/components/seller-gate-notice';
import { StatusBadge } from '@/components/status-badge';
import { StorefrontForm } from '@/components/storefront-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getSellerAccount } from '@/lib/seller';
import { requireUser } from '@/lib/session';

import { updateStorefrontAction } from './actions';

export const metadata: Metadata = { title: 'Store Settings' };

const TITLE = 'Store Settings';
const DESCRIPTION = 'Your storefront, and the business behind it.';

export default async function SettingsPage() {
  await requireUser();
  const account = await getSellerAccount();

  if (account.state !== 'approved') {
    return (
      <SellerGateNotice
        title={TITLE}
        description={DESCRIPTION}
        account={account}
      />
    );
  }

  const { seller } = account;

  const business: { label: string; value: string }[] = [
    { label: 'Business name', value: seller.businessName },
    { label: 'Registration number', value: seller.registrationNumber },
    { label: 'Country', value: seller.country },
    { label: 'Business address', value: seller.businessAddress },
    { label: 'Contact email', value: seller.contactEmail },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        action={<StatusBadge status={seller.status.toLowerCase()} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Storefront</CardTitle>
          <CardDescription>
            What shoppers see. The address is part of your public URL, so
            changing it changes where your storefront lives.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StorefrontForm
            version={seller.version}
            storefrontSlug={seller.storefrontSlug}
            displayName={seller.displayName}
            description={seller.description}
            action={updateStorefrontAction}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
          <CardDescription>
            What you submitted when you applied. The API has no endpoint for
            editing these — changing them means resubmitting the application,
            which goes back through review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {business.map((detail) => (
              <div key={detail.label}>
                <dt className="text-muted-foreground text-xs">
                  {detail.label}
                </dt>
                <dd className="text-pretty">{detail.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
