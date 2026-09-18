'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { CHECKOUT_FORM_ID } from '@/components/checkout-form';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatMinor } from '@/lib/currency';

export type CheckoutQuoteResult =
  | { status: 'ok'; quote: { shippingAmount: number; total: number } }
  | { status: 'error'; message: string };

/**
 * Subtotal, shipping, and a total that matches what checkout will actually
 * charge — re-quoted from the API whenever the chosen address changes, since
 * shipping is priced off its country and cannot be computed here.
 *
 * `itemIds` is a string rather than the array itself in the effect's
 * dependency list: a fresh array literal on every render would otherwise
 * re-quote on every keystroke elsewhere on the page.
 */
export function CheckoutCostSummary({
  subtotal,
  currency,
  selectedAddressId,
  itemIds,
  getQuote,
  footnote,
}: {
  subtotal: number;
  currency: string;
  selectedAddressId: string | undefined;
  itemIds: string[];
  getQuote: (input: {
    shippingAddressId: string;
    currency: string;
    itemIds: string[];
  }) => Promise<CheckoutQuoteResult>;
  footnote?: ReactNode;
}) {
  const [shippingAmount, setShippingAmount] = useState<number | null>(null);
  const [total, setTotal] = useState(subtotal);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const itemIdsKey = itemIds.join(',');

  useEffect(() => {
    if (!selectedAddressId) {
      setShippingAmount(null);
      setTotal(subtotal);
      return;
    }

    let cancelled = false;
    setQuoting(true);
    setQuoteError(null);

    getQuote({
      shippingAddressId: selectedAddressId,
      currency,
      itemIds: itemIdsKey === '' ? [] : itemIdsKey.split(','),
    })
      .then((result) => {
        if (cancelled) return;
        if (result.status === 'error') {
          setQuoteError(result.message);
          setShippingAmount(null);
          setTotal(subtotal);
          return;
        }
        setShippingAmount(result.quote.shippingAmount);
        setTotal(result.quote.total);
      })
      .finally(() => {
        if (!cancelled) setQuoting(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- itemIdsKey stands in for itemIds
  }, [selectedAddressId, currency, itemIdsKey, subtotal, getQuote]);

  return (
    <>
      <Separator />

      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatMinor(subtotal, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Shipping</span>
          <span>
            {quoting
              ? 'Calculating…'
              : shippingAmount !== null
                ? formatMinor(shippingAmount, currency)
                : quoteError
                  ? 'Confirmed when you pay'
                  : '—'}
          </span>
        </div>
      </div>

      <Separator />

      <div className="flex justify-between text-sm font-semibold">
        <span>Total</span>
        <span>{formatMinor(total, currency)}</span>
      </div>

      <Button
        type="submit"
        form={CHECKOUT_FORM_ID}
        className="w-full"
        disabled={quoting}
      >
        Pay {formatMinor(total, currency)}
      </Button>

      {quoteError ? (
        <p className="text-muted-foreground text-xs text-pretty">
          Could not estimate shipping ahead of time; the exact amount is
          confirmed when you pay.
        </p>
      ) : null}

      {footnote}
    </>
  );
}
