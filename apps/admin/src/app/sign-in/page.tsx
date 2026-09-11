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
import { getCurrentUser } from '@/lib/session';
import { readParam } from '@/lib/search-params';

import { signInAction } from './actions';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: PageProps<'/sign-in'>) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (user?.roles.includes('admin')) {
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
            Development accounts, served by the mock API:{' '}
            <code className="font-mono">admin@commerce.test</code> with password{' '}
            <code className="font-mono">password123</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
