import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { OwnSeller } from '@/lib/sellers';

const STATUS_COPY: Record<OwnSeller['status'], string> = {
  PENDING: 'Your application is under review. An administrator will get back to you.',
  REJECTED: 'Your last application wasn’t approved. You can update it and send it back for review.',
  SUSPENDED: 'Your seller account is currently suspended.',
  APPROVED: 'You’re an approved seller.',
};

/**
 * Selling, from the customer's own account — one account for both, so this
 * is either an invitation to apply or a way back into the seller portal
 * (apps/seller), which keeps its own separate login.
 */
export function SellerAccountCard({
  seller,
  becomeSeller,
  goToDashboard,
}: {
  seller: OwnSeller | null;
  becomeSeller: () => Promise<void>;
  goToDashboard: () => Promise<void>;
}) {
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Selling</CardTitle>
        <CardDescription>
          {seller
            ? STATUS_COPY[seller.status]
            : 'List your own products alongside ours — apply with this same account.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {seller === null || seller.status === 'REJECTED' ? (
          <form action={becomeSeller}>
            <Button type="submit">
              {seller ? 'Resubmit application' : 'Become a seller'}
            </Button>
          </form>
        ) : (
          <form action={goToDashboard}>
            <Button type="submit" variant="outline">
              {seller.status === 'APPROVED'
                ? 'Go to seller dashboard'
                : 'View application status'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
