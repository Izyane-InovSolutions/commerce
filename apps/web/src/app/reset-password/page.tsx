import type { Metadata } from 'next';
import Link from 'next/link';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { confirmPasswordResetAction } from './actions';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = { title: 'Reset password' };

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<'/reset-password'>) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : '';

  return (
    <div className="px-4 py-12">
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>
            Your reset link can be used once and expires after one hour.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {token ? (
            <ResetPasswordForm
              action={confirmPasswordResetAction}
              token={token}
            />
          ) : (
            <p className="text-sm">
              This reset link is missing its token.{' '}
              <Link
                className="text-primary hover:underline"
                href="/forgot-password"
              >
                Request a new link
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
