import type { Metadata } from 'next';

import { listSellerApplications, listSellers } from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { ApplicationReview } from '@/components/application-review';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { SellerLogo } from '@/components/seller-logo';
import { SellerStatusToggle } from '@/components/seller-status-toggle';
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
import { requireAdmin } from '@/lib/session';

import {
  approveApplicationAction,
  rejectApplicationAction,
  setSellerStatusAction,
} from './actions';

export const metadata: Metadata = { title: 'Sellers' };

export default async function SellersPage() {
  await requireAdmin();

  let applications;
  let sellers;
  try {
    [applications, sellers] = await Promise.all([
      listSellerApplications(apiClient, { pageSize: 50 }),
      listSellers(apiClient, { pageSize: 50 }),
    ]);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Sellers"
          description="Applications, verification, approval, and suspension."
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const pending = applications.items.filter(
    (application) => application.status === 'pending',
  );
  const reviewed = applications.items.filter(
    (application) => application.status !== 'pending',
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Sellers"
        description="Approving an application creates the seller account and grants the applicant the seller role. Nothing a seller does can grant it to themselves."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Applications
            {pending.length > 0 ? (
              <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs font-medium tabular-nums">
                {pending.length} waiting
              </span>
            ) : null}
          </CardTitle>
          <CardDescription>
            People asking to sell on the platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pending.length === 0 ? (
            <EmptyState
              title="Nothing waiting"
              description="Every application has been reviewed."
            />
          ) : (
            pending.map((application) => (
              <div
                key={application.id}
                className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{application.displayName}</p>
                  <p className="text-muted-foreground font-mono text-xs">
                    /{application.slug}
                  </p>
                  <p className="max-w-xl text-sm text-pretty">
                    {application.description}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {application.userName} · {application.userEmail} · contact{' '}
                    {application.contactEmail}
                  </p>
                </div>
                <ApplicationReview
                  application={application}
                  approve={approveApplicationAction.bind(null, application.id)}
                  reject={rejectApplicationAction.bind(null, application.id)}
                />
              </div>
            ))
          )}

          {reviewed.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewed.map((application) => (
                    <TableRow key={application.id}>
                      <TableCell>{application.userName}</TableCell>
                      <TableCell>{application.displayName}</TableCell>
                      <TableCell>
                        <StatusBadge status={application.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {application.rejectionReason ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seller accounts</CardTitle>
          <CardDescription>
            Suspending a seller removes their offers from the storefront
            immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sellers.items.length === 0 ? (
            <EmptyState
              title="No sellers yet"
              description="Approve an application to create the first seller account."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Seller</TableHead>
                    <TableHead>Store address</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sellers.items.map((seller) => (
                    <TableRow key={seller.id}>
                      <TableCell>
                        <span className="flex items-center gap-2.5">
                          <SellerLogo seller={seller} />
                          <span className="font-medium">{seller.name}</span>
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        /{seller.slug}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={seller.status} />
                      </TableCell>
                      <TableCell>
                        <SellerStatusToggle
                          seller={seller}
                          action={setSellerStatusAction.bind(
                            null,
                            seller.id,
                            seller.status === 'approved',
                          )}
                        />
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
