import type { Metadata } from 'next';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { requestPasswordResetAction } from './actions';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <div className="px-4 py-12">
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            Enter your email and we will send you a one-hour reset link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm action={requestPasswordResetAction} />
        </CardContent>
      </Card>
    </div>
  );
}
