import type { Metadata } from 'next';
import Link from 'next/link';

import { ForgotPasswordForm } from '@/components/password-reset-forms';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { requestPasswordResetAction } from '../account/actions';

export const metadata: Metadata = {
  title: 'Forgot password',
};

export default function ForgotPasswordPage() {
  return (
    <div className="px-4 py-12">
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle>Forgot your password?</CardTitle>
          <CardDescription>
            Enter the email you sign in with and we’ll send you a link to
            choose a new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm action={requestPasswordResetAction} />
        </CardContent>
        <CardFooter className="justify-center">
          <Link
            href="/account"
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
