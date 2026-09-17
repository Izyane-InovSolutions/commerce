'use client';

import { useActionState, useState } from 'react';

import { AddressForm } from '@/components/address-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Address } from '@/lib/commerce-types';
import { idleFormState, type FormState } from '@/lib/form';

/** One saved address: view, edit in place, set default, or remove. */
export function AddressListItem({
  address,
  update,
  remove,
  setDefault,
}: {
  address: Address;
  update: (state: FormState, formData: FormData) => Promise<FormState>;
  remove: () => Promise<FormState>;
  setDefault: () => Promise<FormState>;
}) {
  const [editing, setEditing] = useState(false);
  const [removeState, removeAction] = useActionState(
    async () => remove(),
    idleFormState,
  );
  const [defaultState, defaultAction] = useActionState(
    async () => setDefault(),
    idleFormState,
  );

  if (editing) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <AddressForm
            action={async (state, formData) => {
              const result = await update(state, formData);
              if (result.status === 'idle') {
                setEditing(false);
              }
              return result;
            }}
            defaultValues={address}
            submitLabel="Save changes"
          />
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </CardContent>
      </Card>
    );
  }

  const error =
    removeState.status === 'error'
      ? removeState.message
      : defaultState.status === 'error'
        ? defaultState.message
        : undefined;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-medium">
              {address.recipientName}
              {address.isDefault ? (
                <Badge variant="secondary">Default</Badge>
              ) : null}
            </p>
            <p className="text-muted-foreground text-sm text-pretty">
              {[
                address.line1,
                address.line2,
                address.city,
                address.region,
                address.postalCode,
                address.country,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
            {address.phone ? (
              <p className="text-muted-foreground text-sm">{address.phone}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {address.isDefault ? null : (
            <form action={defaultAction}>
              <Button type="submit" variant="outline" size="sm">
                Set as default
              </Button>
            </form>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <form action={removeAction}>
            <Button type="submit" variant="ghost" size="sm">
              Remove
            </Button>
          </form>
        </div>

        {error ? (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
