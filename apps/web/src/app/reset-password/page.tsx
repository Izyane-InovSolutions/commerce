import type { Metadata } from 'next';
import Link from 'next/link';

import { ResetPasswordForm } from '@/components/password-reset-forms';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { confirmPasswordResetAction } from '../account/actions';

export const metadata: Metadata = {
  title: 'Reset password',
  // The URL carries a live, single-use credential.
  referrer: 'no-referrer',
  robots: { index: false },
};

/**
 * Where the password reset email links to — `/reset-password?token=…`. The
 * token is only checked when the form is submitted: the API has no way to ask
 * whether one is valid without spending it.
 */
export default async function ResetPasswordPage({
  searchParams,
}: PageProps<'/reset-password'>) {
  const { token: rawToken } = await searchParams;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  return (
    <div>
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          {token ? null : (
            <CardDescription>
              This link is missing its reset code. Open the link from the
              email again, or request a new one.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {token ? (
            <ResetPasswordForm
              action={confirmPasswordResetAction}
              token={token}
            />
          ) : (
            <Button asChild className="w-full">
              <Link href="/forgot-password">Request a new link</Link>
            </Button>
          )}
        </CardContent>
        {token ? (
          <CardFooter className="justify-center">
            <Link
              href="/forgot-password"
              className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
            >
              Need a new link?
            </Link>
          </CardFooter>
        ) : null}
      </Card>
    </div>
  );
}
