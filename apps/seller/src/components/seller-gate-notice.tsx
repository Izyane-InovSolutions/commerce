import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { SellerAccount } from '@/lib/seller';

/**
 * Shown in place of a section when the account cannot use it yet.
 *
 * This is deliberately not an error: an application under review is the
 * normal path, and saying so beats an empty table or a forbidden response.
 */
export function SellerGateNotice({
  title,
  description,
  account,
}: {
  title: string;
  description: string;
  account: Extract<SellerAccount, { state: 'none' | 'unapproved' }>;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>
            {account.state === 'none'
              ? 'No seller application yet'
              : 'Your application is not approved yet'}
          </CardTitle>
          <CardDescription>
            {account.state === 'none'
              ? 'Selling opens up once you have applied and been approved.'
              : 'Approval is what unlocks listing, orders, and payouts.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-3 text-sm">
          {account.state === 'unapproved' ? (
            <>
              <p className="flex items-center gap-2">
                <span>Current standing:</span>
                <StatusBadge status={account.seller.status.toLowerCase()} />
              </p>
              {account.seller.reviewReason ? (
                <p className="text-pretty">
                  Last decision: {account.seller.reviewReason}
                </p>
              ) : null}
              {account.seller.status === 'REJECTED' ? (
                <Button asChild size="sm">
                  <Link href="/apply">Resubmit application</Link>
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-pretty">
                Apply to sell, and an administrator will review it. You will
                see the decision here.
              </p>
              <Button asChild size="sm">
                <Link href="/apply">Apply as a seller</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
