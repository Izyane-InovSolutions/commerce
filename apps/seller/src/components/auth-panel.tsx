'use client';

import { useState } from 'react';

import { SignInForm } from '@/components/sign-in-form';
import { SignUpForm } from '@/components/sign-up-form';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { FormState } from '@/lib/form';

type AuthPanelProps = {
  signIn: (state: FormState, formData: FormData) => Promise<FormState>;
  signUp: (state: FormState, formData: FormData) => Promise<FormState>;
  next: string;
};

/**
 * The sign-in page: one card that switches between signing in and creating
 * an account, rather than showing both forms at once.
 */
export function AuthPanel({ signIn, signUp, next }: AuthPanelProps) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const isSignIn = mode === 'sign-in';

  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle>{isSignIn ? 'Sign in' : 'Start selling'}</CardTitle>
        <CardDescription>
          {isSignIn
            ? 'Manage your store, offers, and orders.'
            : 'Creating an account gives you a customer login first — apply to sell once you are signed in, and an administrator will review it.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isSignIn ? (
          <>
            <SignInForm action={signIn} next={next} />
            <p className="text-muted-foreground border-t pt-4 text-xs">
              Signs in against the Commerce API. Roles are assigned in the
              database — registering here creates a{' '}
              <code className="font-mono">CUSTOMER</code>.
            </p>
          </>
        ) : (
          <SignUpForm action={signUp} next={next} />
        )}
      </CardContent>
      <CardFooter className="justify-center">
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => setMode(isSignIn ? 'sign-up' : 'sign-in')}
        >
          {isSignIn
            ? "Don't have an account? Start selling"
            : 'Already have an account? Sign in'}
        </Button>
      </CardFooter>
    </Card>
  );
}
