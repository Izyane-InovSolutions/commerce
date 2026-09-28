'use client';

import { useActionState } from 'react';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-form';
import type { UserProfile } from '@/lib/profile';

type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

function SuccessMessage({ state }: { state: FormState }) {
  if (state.status !== 'idle' || !state.message) {
    return null;
  }

  return (
    <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
      {state.message}
    </p>
  );
}

function ProfileForm({
  profile,
  action,
}: {
  profile: UserProfile;
  action: FormAction;
}) {
  const [state, formAction] = useActionState(action, idleFormState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <FormError state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="profile-first-name">First name</Label>
          <Input
            id="profile-first-name"
            name="firstName"
            autoComplete="given-name"
            defaultValue={profile.firstName ?? ''}
            aria-invalid={fieldErrors.firstName !== undefined}
          />
          <FieldError messages={fieldErrors.firstName} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="profile-last-name">Last name</Label>
          <Input
            id="profile-last-name"
            name="lastName"
            autoComplete="family-name"
            defaultValue={profile.lastName ?? ''}
            aria-invalid={fieldErrors.lastName !== undefined}
          />
          <FieldError messages={fieldErrors.lastName} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="profile-phone">Phone (optional)</Label>
          <Input
            id="profile-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            defaultValue={profile.phone ?? ''}
            aria-invalid={fieldErrors.phone !== undefined}
          />
          <FieldError messages={fieldErrors.phone} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="profile-email">Email</Label>
          <Input
            id="profile-email"
            value={profile.email}
            readOnly
            disabled
            aria-describedby="profile-email-note"
          />
          <p
            id="profile-email-note"
            className="text-muted-foreground text-xs"
          >
            This is the address you sign in with, and it can’t be changed
            here.
          </p>
        </div>
      </div>

      <SuccessMessage state={state} />
      <SubmitButton size="sm" pendingLabel="Saving…">
        Save profile
      </SubmitButton>
    </form>
  );
}

function ChangePasswordForm({ action }: { action: FormAction }) {
  const [state, formAction] = useActionState(action, idleFormState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <FormError state={state} />

      <div className="space-y-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <Input
          id="current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={fieldErrors.currentPassword !== undefined}
        />
        <FieldError messages={fieldErrors.currentPassword} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            aria-invalid={fieldErrors.newPassword !== undefined}
          />
          <FieldError messages={fieldErrors.newPassword} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={fieldErrors.confirmPassword !== undefined}
          />
          <FieldError messages={fieldErrors.confirmPassword} />
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        At least {MIN_PASSWORD_LENGTH} characters. Changing it signs you out
        on every other device.
      </p>

      <SuccessMessage state={state} />
      <SubmitButton size="sm" pendingLabel="Changing…">
        Change password
      </SubmitButton>
    </form>
  );
}

/** The account page's Settings tab: the shopper's own details, and their
 * password. */
export function AccountSettings({
  profile,
  updateProfile,
  changePassword,
}: {
  profile: UserProfile;
  updateProfile: FormAction;
  changePassword: FormAction;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Your name and phone number.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={profile} action={updateProfile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm action={changePassword} />
        </CardContent>
      </Card>
    </div>
  );
}
