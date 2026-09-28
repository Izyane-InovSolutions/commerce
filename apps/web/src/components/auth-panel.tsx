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
  /** Shown above the form — e.g. once a password reset has gone through. */
  notice?: string;
};

/**
 * The signed-out account page: one card that switches between sign-in and
 * sign-up, rather than showing both forms at once.
 */
export function AuthPanel({ signIn, signUp, next, notice }: AuthPanelProps) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const isSignIn = mode === 'sign-in';

  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle>{isSignIn ? 'Sign in' : 'Create an account'}</CardTitle>
        <CardDescription>
          {isSignIn
            ? 'Sign in to your account and access your orders, saved items, and more.'
            : 'Create an account and get started.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {notice ? (
          <p
            role="status"
            className="rounded-lg border border-dashed px-3 py-2 text-sm"
          >
            {notice}
          </p>
        ) : null}
        {isSignIn ? (
          <SignInForm action={signIn} next={next} />
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
            ? "Don't have an account? Sign up"
            : 'Already have an account? Sign in'}
        </Button>
      </CardFooter>
    </Card>
  );
}
