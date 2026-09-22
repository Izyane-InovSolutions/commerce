import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SignInForm } from '@/components/sign-in-form';
import { SignUpForm } from '@/components/sign-up-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getCurrentUser } from '@/lib/session';

import { signInAction, signUpAction } from './actions';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage() {
  if (await getCurrentUser()) {
    redirect('/');
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-6 py-8 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Manage your store, offers, and orders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SignInForm action={signInAction} next="/" />
          <p className="text-muted-foreground border-t pt-4 text-xs">
            Signs in against the Commerce API. Roles are assigned in the
            database — registering here creates a{' '}
            <code className="font-mono">CUSTOMER</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Start selling</CardTitle>
          <CardDescription>
            Creating an account gives you a customer login first — apply to
            sell once you are signed in, and an administrator will review it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpForm action={signUpAction} next="/" />
        </CardContent>
      </Card>
    </div>
  );
}
