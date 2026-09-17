import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { SellerApplicationForm } from '@/components/seller-application-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getSellerAccount } from '@/lib/seller';
import { requireUser } from '@/lib/session';

import { applyAction, resubmitAction, uploadSellerDocumentAction } from './actions';

export const metadata: Metadata = { title: 'Become a seller' };

export default async function ApplyPage() {
  await requireUser();
  const account = await getSellerAccount();

  // Approved sellers, and anyone whose application is still pending or
  // suspended, have nothing to do here — the dashboard already tells them
  // where they stand. Only a fresh applicant or a rejected one belongs on
  // this page.
  if (account.state === 'approved') {
    redirect('/');
  }
  if (account.state === 'unapproved' && account.seller.status !== 'REJECTED') {
    redirect('/');
  }

  const isResubmit = account.state === 'unapproved';

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <PageHeader
        title={isResubmit ? 'Resubmit your application' : 'Become a seller'}
        description={
          isResubmit
            ? 'Update your details and verification documents, then send it back for review.'
            : 'Tell us about your business. An administrator reviews every application before it can start selling.'
        }
      />

      {isResubmit && account.seller.reviewReason ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base">Why it was rejected</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm text-pretty">
            {account.seller.reviewReason}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
          <CardDescription>
            {isResubmit
              ? 'Resubmitting replaces every document you had on file — upload them again even if nothing else changed.'
              : 'Every field here goes to the reviewer; none of it is public until you set up your storefront after approval.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SellerApplicationForm
            defaultValues={isResubmit ? account.seller : undefined}
            submitLabel={isResubmit ? 'Resubmit application' : 'Submit application'}
            submit={isResubmit ? resubmitAction : applyAction}
            uploadDocument={uploadSellerDocumentAction}
          />
        </CardContent>
      </Card>
    </div>
  );
}
