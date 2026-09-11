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
            Development accounts, served by the mock API:{' '}
            <code className="font-mono">seller@deskworks.test</code> (an
            approved seller) or{' '}
            <code className="font-mono">shopper@example.test</code> (a shopper
            with no store yet), both with password{' '}
            <code className="font-mono">password123</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Start selling</CardTitle>
          <CardDescription>
            Create an account, then apply for a store. An administrator reviews
            every application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpForm action={signUpAction} next="/apply" />
        </CardContent>
      </Card>
    </div>
  );
}
