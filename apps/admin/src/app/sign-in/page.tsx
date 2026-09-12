import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SignInForm } from '@/components/sign-in-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getCurrentUser, isAdmin } from '@/lib/session';
import { readParam } from '@/lib/search-params';

import { signInAction } from './actions';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: PageProps<'/sign-in'>) {
  const params = await searchParams;
  if (isAdmin(await getCurrentUser())) {
    redirect('/');
  }

  const wrongRole = readParam(params, 'error') === 'admin-only';

  return (
    <div className="mx-auto max-w-sm py-8">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            {wrongRole
              ? 'That account does not have administrator access.'
              : 'Administrator access to the Commerce platform.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SignInForm action={signInAction} next="/" />
          <p className="text-muted-foreground border-t pt-4 text-xs">
            Signs in against the Commerce API. This portal needs an{' '}
            <code className="font-mono">ADMIN</code> or{' '}
            <code className="font-mono">STAFF</code> account; roles are assigned
            in the database.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
