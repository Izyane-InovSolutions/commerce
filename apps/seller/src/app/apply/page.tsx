import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getMyApplication } from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { ApplyForm } from '@/components/apply-form';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { requireUser } from '@/lib/session';

import { applyAction } from './actions';

export const metadata: Metadata = { title: 'Apply to sell' };

export default async function ApplyPage() {
  const user = await requireUser();
  if (user.sellerId && user.roles.includes('seller')) {
    redirect('/');
  }

  let application;
  try {
    application = await getMyApplication(apiClient);
  } catch (error) {
    return <ApiErrorNotice error={error} />;
  }

  if (application?.status === 'pending') {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Application under review"
          description="An administrator is looking at your application. You will be able to list products once it is approved."
        />
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {application.displayName}
              <StatusBadge status={application.status} />
            </CardTitle>
            <CardDescription className="font-mono">
              /{application.slug}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-2 text-sm">
            <p>{application.description}</p>
            <p>Contact: {application.contactEmail}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Apply to sell"
        description="Tell us about your store. An administrator reviews every application before you can list anything."
      />

      {application?.status === 'rejected' ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 max-w-xl space-y-1 rounded-xl border px-4 py-3"
        >
          <p className="text-destructive text-sm font-medium">
            Your previous application was turned down.
          </p>
          <p className="text-sm">{application.rejectionReason}</p>
          <p className="text-muted-foreground text-sm">
            You can address that and apply again below.
          </p>
        </div>
      ) : null}

      <ApplyForm action={applyAction} />
    </div>
  );
}
