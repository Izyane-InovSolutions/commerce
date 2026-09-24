'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { SignInForm } from '@/components/sign-in-form';
import { SignUpForm } from '@/components/sign-up-form';
import type { FormState } from '@/lib/form';

type AuthPanelProps = {
  signIn: (state: FormState, formData: FormData) => Promise<FormState>;
  signUp: (state: FormState, formData: FormData) => Promise<FormState>;
  next: string;
};

/**
 * The signed-out account page: one split card, always with a blue panel
 * carrying whichever form is active and a plain panel offering to switch —
 * rather than two side-by-side forms, since only one is ever being filled in.
 */
export function AuthPanel({ signIn, signUp, next }: AuthPanelProps) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');

  return (
    <div className="mx-auto grid max-w-4xl overflow-hidden rounded-[1rem] shadow-xl md:grid-cols-2">
      <div className="relative isolate flex flex-col justify-center gap-10 overflow-hidden bg-gradient-to-br from-cyan-600 to-blue-800 px-8 py-36 sm:px-18">
        <div
          aria-hidden
          className="absolute -top-16 -left-16 -z-10 size-56 rounded-full bg-white/10"
        />
        <div
          aria-hidden
          className="absolute -bottom-24 -left-10 -z-10 size-72 rounded-full bg-white/5"
        />
        <div
          aria-hidden
          className="absolute right-0 -bottom-16 -z-10 size-40 rounded-full bg-blue-400/30"
        />

        {mode === 'sign-in' ? (
          <>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-white">Welcome back</h1>
              <p className="text-sm text-white/70">
                Sign in to your account to continue.
              </p>
            </div>
            <SignInForm action={signIn} next={next} />
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-white">
                Already have an account?
              </h1>
              <p className="text-sm text-white/70">
                Sign back in and continue where you left off.
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full rounded-full border-white/60 bg-transparent text-white hover:bg-blue-800 hover:text-white"
              onClick={() => setMode('sign-in')}
            >
              Sign in
            </Button>
          </>
        )}
      </div>

      <div className="flex flex-col justify-center gap-8 bg-white px-8 py-32 sm:px-18">
        
        {mode === 'sign-in' ? (
          <>
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-slate-900">New here?</h2>
              <p className="text-muted-foreground text-sm text-pretty">
                Create an account to save items, track orders, and check out
                faster.
              </p>
            </div>
            <Button
              className="w-full rounded-full bg-blue-400 text-white hover:bg-blue-800/90"
              onClick={() => setMode('sign-up')}
            >
              Sign up
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-slate-900">
                Create an account
              </h2>
              <p className="text-muted-foreground text-sm text-pretty">
                New accounts start as a customer. Selling and admin access
                are granted separately.
              </p>
            </div>
            <SignUpForm action={signUp} next={next} />
          </>
        )}
      </div>
    </div>
  );
}
