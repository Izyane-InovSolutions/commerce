'use client';

import { useActionState, useState } from 'react';

import type { Brand, Category, Product } from '@commerce/contracts';

import { FormError } from '@/components/form-error';
import { ProposalReview } from '@/components/proposal-review';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { idleFormState, type FormState } from '@/lib/form';

type ProductModerationProps = {
  product: Product;
  brands: Brand[];
  categories: Category[];
  approve: () => Promise<FormState>;
  reject: (state: FormState, formData: FormData) => Promise<FormState>;
  resolveBrand: (state: FormState, formData: FormData) => Promise<FormState>;
  resolveCategory: (state: FormState, formData: FormData) => Promise<FormState>;
};

/**
 * The decision on a seller-submitted product.
 *
 * Approving is what makes it public — the seller can already have an active
 * offer against it, and the storefront still will not show it until this.
 */
export function ProductModeration({
  product,
  brands,
  categories,
  approve,
  reject,
  resolveBrand,
  resolveCategory,
}: ProductModerationProps) {
  const [rejecting, setRejecting] = useState(false);
  const [approveState, approveAction] = useActionState<FormState>(
    approve,
    idleFormState,
  );
  const [rejectState, rejectAction] = useActionState(reject, idleFormState);

  if (product.status !== 'pending') {
    return null;
  }

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle>Waiting for review</CardTitle>
        <CardDescription>
          Submitted by {product.submittedBySellerName ?? 'a seller'}. It is not
          visible to shoppers until it is approved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {product.proposedBrandName ? (
          <ProposalReview
            axis="brand"
            proposed={product.proposedBrandName}
            existing={brands.map((brand) => ({
              value: brand.id,
              label: brand.name,
            }))}
            action={resolveBrand}
          />
        ) : null}

        {product.proposedCategoryName ? (
          <ProposalReview
            axis="category"
            proposed={product.proposedCategoryName}
            existing={categories.map((category) => ({
              value: category.id,
              label: category.name,
            }))}
            parents={categories.map((category) => ({
              value: category.id,
              label: category.name,
            }))}
            action={resolveCategory}
          />
        ) : null}

        {rejecting ? (
          <form action={rejectAction} className="max-w-md space-y-2">
            <FormError state={rejectState} />
            <Textarea
              name="reason"
              rows={2}
              required
              placeholder="What does the seller need to change?"
              aria-label="Reason for rejection"
            />
            <div className="flex gap-2">
              <SubmitButton pendingLabel="Rejecting…">
                Confirm rejection
              </SubmitButton>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRejecting(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-1">
            <div className="flex gap-2">
              <form action={approveAction}>
                <SubmitButton pendingLabel="Approving…">
                  Approve and publish
                </SubmitButton>
              </form>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRejecting(true)}
              >
                Reject
              </Button>
            </div>
            <FormError state={approveState} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
