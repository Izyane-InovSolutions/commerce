import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthPanel } from '@/components/auth-panel';
import { getCurrentUser } from '@/lib/session';

import { signInAction, signUpAction } from './actions';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage() {
  if (await getCurrentUser()) {
    redirect('/');
  }

  return (
    <div className="py-8">
      <AuthPanel signIn={signInAction} signUp={signUpAction} next="/" />
    </div>
  );
}
