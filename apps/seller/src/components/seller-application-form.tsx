'use client';

import { useActionState, useState, type ChangeEvent } from 'react';

import type { BackendSellerDetail } from '@commerce/contracts';

import { FieldError } from '@/components/field-error';
import { FormError } from '@/components/form-error';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { idleFormState, type FormState } from '@/lib/form';
import type { UploadDocumentResult, UploadedDocument } from '@/app/apply/actions';

type ApplicationDefaults = Pick<
  BackendSellerDetail,
  'businessName' | 'registrationNumber' | 'country' | 'businessAddress' | 'contactEmail'
>;

/**
 * Business details plus verification documents, for both the first
 * application and a resubmission.
 *
 * Documents upload immediately, one at a time, ahead of the form itself —
 * the application endpoint takes their ids directly, and there is nowhere to
 * attach one after the fact the way a product image can be added later.
 */
export function SellerApplicationForm({
  defaultValues,
  submitLabel,
  submit,
  uploadDocument,
}: {
  defaultValues?: ApplicationDefaults;
  submitLabel: string;
  submit: (state: FormState, formData: FormData) => Promise<FormState>;
  uploadDocument: (formData: FormData) => Promise<UploadDocumentResult>;
}) {
  const [state, formAction] = useActionState(submit, idleFormState);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setUploading(true);
    setUploadError(null);

    const body = new FormData();
    body.append('file', file);
    const result = await uploadDocument(body);

    setUploading(false);

    if (result.status === 'error') {
      setUploadError(result.message);
      return;
    }

    setDocuments((current) => [...current, result.document]);
  }

  function removeDocument(id: string): void {
    setDocuments((current) => current.filter((document) => document.id !== id));
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="apply-business-name">Business name</Label>
          <Input
            id="apply-business-name"
            name="businessName"
            defaultValue={defaultValues?.businessName}
            minLength={2}
            maxLength={200}
            required
            aria-invalid={state.fieldErrors?.businessName ? true : undefined}
          />
          <FieldError messages={state.fieldErrors?.businessName} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="apply-registration-number">
            Registration number
          </Label>
          <Input
            id="apply-registration-number"
            name="registrationNumber"
            defaultValue={defaultValues?.registrationNumber}
            minLength={2}
            maxLength={100}
            required
            aria-invalid={
              state.fieldErrors?.registrationNumber ? true : undefined
            }
          />
          <FieldError messages={state.fieldErrors?.registrationNumber} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="apply-country">Country</Label>
          <Input
            id="apply-country"
            name="country"
            defaultValue={defaultValues?.country}
            maxLength={2}
            pattern="[A-Za-z]{2}"
            title="Two-letter country code"
            className="uppercase"
            required
            aria-invalid={state.fieldErrors?.country ? true : undefined}
          />
          <FieldError messages={state.fieldErrors?.country} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="apply-address">Business address</Label>
          <Input
            id="apply-address"
            name="businessAddress"
            defaultValue={defaultValues?.businessAddress}
            minLength={5}
            maxLength={1000}
            required
            aria-invalid={
              state.fieldErrors?.businessAddress ? true : undefined
            }
          />
          <FieldError messages={state.fieldErrors?.businessAddress} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="apply-contact-email">Contact email</Label>
          <Input
            id="apply-contact-email"
            name="contactEmail"
            type="email"
            defaultValue={defaultValues?.contactEmail}
            maxLength={254}
            required
            aria-invalid={state.fieldErrors?.contactEmail ? true : undefined}
          />
          <FieldError messages={state.fieldErrors?.contactEmail} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="apply-document">Verification documents</Label>
        <Input
          id="apply-document"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={handleFile}
          disabled={uploading}
          className="file:text-foreground file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
        />
        <p className="text-muted-foreground text-xs text-pretty">
          Business registration, proof of address, or ID — JPEG, PNG, WebP, or
          PDF, up to 10MB each.
        </p>

        {uploading ? (
          <p className="text-muted-foreground text-xs" role="status">
            Uploading…
          </p>
        ) : null}
        {uploadError ? (
          <p className="text-destructive text-sm" role="alert">
            {uploadError}
          </p>
        ) : null}

        {documents.length > 0 ? (
          <ul className="space-y-1.5">
            {documents.map((document) => (
              <li
                key={document.id}
                className="bg-muted/40 flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm"
              >
                <span className="truncate">{document.fileName}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeDocument(document.id)}
                >
                  Remove
                </Button>
                <input type="hidden" name="documentIds" value={document.id} />
              </li>
            ))}
          </ul>
        ) : null}

        <FieldError messages={state.fieldErrors?.documentIds} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Submitting…">{submitLabel}</SubmitButton>
      </div>

      <FormError state={state} />
    </form>
  );
}
