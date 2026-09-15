import type { Metadata } from 'next';

import { SignInForm } from '@/components/sign-in-form';
import { SignUpForm } from '@/components/sign-up-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getCurrentUser } from '@/lib/session';

import { signInAction, signOutAction, signUpAction } from './actions';

export const metadata: Metadata = {
  title: 'Account',
};

export default async function AccountPage() {
  const user = await getCurrentUser();

  if (user) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {user.email}
              <Badge variant="secondary">{user.role}</Badge>
            </CardTitle>
            <CardDescription>You&apos;re signed in.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={signOutAction}>
              <Button type="submit" variant="outline">
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 py-12 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            One account for customers, sellers, and admins — sign in here either
            way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm action={signInAction} next="/account" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>
            New accounts start as a customer. Selling and admin access are
            granted separately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpForm action={signUpAction} next="/account" />
        </CardContent>
      </Card>
    </div>
  );
}
