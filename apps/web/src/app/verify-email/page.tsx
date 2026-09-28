import type { Metadata } from 'next';
import Link from 'next/link';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { confirmEmailVerificationAction } from './actions';
import { VerifyEmailForm } from './verify-email-form';

export const metadata: Metadata = { title: 'Verify email' };

export default async function VerifyEmailPage({
  searchParams,
}: PageProps<'/verify-email'>) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : '';

  return (
    <div className="px-4 py-12">
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle>Verify your email</CardTitle>
          <CardDescription>
            Confirm this address to unlock seller features.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {token ? (
            <VerifyEmailForm
              action={confirmEmailVerificationAction}
              token={token}
            />
          ) : (
            <p className="text-sm">
              This verification link is missing its token.{' '}
              <Link className="text-primary hover:underline" href="/account">
                Return to your account
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
