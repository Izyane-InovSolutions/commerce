'use client';

import { useActionState, type ReactNode } from 'react';
import Image from 'next/image';
import { Star, Trash } from 'lucide-react';

import type { BackendProductMedia } from '@commerce/contracts';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';

/**
 * The product's images.
 *
 * The primary one is what the storefront leads with; the rest follow in
 * position order. An image that is still uploading has no URL yet, so it is
 * listed by name rather than shown.
 */
export function ProductImages({
  media,
  upload,
  setPrimary,
  remove,
}: {
  media: BackendProductMedia[];
  upload: (state: FormState, formData: FormData) => Promise<FormState>;
  setPrimary: (mediaId: string) => Promise<FormState>;
  remove: (mediaId: string) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(upload, idleFormState);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="product-image">Add an image</Label>
          <Input
            id="product-image"
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            className="file:text-foreground file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
            aria-invalid={state.fieldErrors?.file ? true : undefined}
          />
          <FieldError messages={state.fieldErrors?.file} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
          {state.status === 'idle' && state.message ? (
            <span className="text-muted-foreground text-xs" role="status">
              {state.message}
            </span>
          ) : null}
        </div>

        <FormError state={state} />
      </form>

      {media.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No images yet. The first one you add becomes the primary image.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {media.map((entry) => (
            <li key={entry.id} className="space-y-2">
              <div className="bg-muted relative aspect-square overflow-hidden rounded-lg border">
                {entry.url ? (
                  <Image
                    src={entry.url}
                    alt={entry.mediaAsset.originalFileName}
                    fill
                    sizes="(min-width: 1024px) 20vw, 40vw"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="text-muted-foreground absolute inset-0 grid place-items-center text-xs">
                    Uploading…
                  </span>
                )}
                {entry.isPrimary ? (
                  <Badge className="absolute top-2 left-2">Primary</Badge>
                ) : null}
              </div>

              <p className="text-muted-foreground truncate font-mono text-xs">
                {entry.mediaAsset.originalFileName}
              </p>

              <div className="flex items-center gap-1">
                {entry.isPrimary ? null : (
                  <ImageAction
                    action={setPrimary.bind(null, entry.id)}
                    label="Make primary"
                    icon={<Star data-icon="inline-start" />}
                  />
                )}
                <ImageAction
                  action={remove.bind(null, entry.id)}
                  label="Remove"
                  icon={<Trash data-icon="inline-start" />}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One button, one action, with whatever the action says back about it. */
function ImageAction({
  action,
  label,
  icon,
}: {
  action: () => Promise<FormState>;
  label: string;
  icon: ReactNode;
}) {
  const [state, formAction] = useActionState(
    async () => action(),
    idleFormState,
  );

  return (
    <form action={formAction}>
      <Button type="submit" variant="ghost" size="sm">
        {icon}
        {label}
      </Button>
      {state.status === 'error' ? (
        <span className="text-destructive text-xs" role="alert">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
