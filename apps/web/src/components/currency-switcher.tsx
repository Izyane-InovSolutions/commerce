'use client';

import { useRef } from 'react';

import { backendCurrencies } from '@commerce/contracts';

/**
 * Switches the currency the storefront prices in.
 *
 * Submits on change so it behaves like a control rather than a form, but it
 * is still a real form — with JavaScript off, the select is a plain one and
 * the button beside it submits.
 */
export function CurrencySwitcher({
  currency,
  action,
}: {
  currency: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="flex items-center gap-1">
      <label htmlFor="currency-switcher" className="sr-only">
        Currency
      </label>
      <select
        id="currency-switcher"
        name="currency"
        defaultValue={currency}
        onChange={() => formRef.current?.requestSubmit()}
        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 rounded-lg border bg-transparent px-2 text-sm outline-none focus-visible:ring-3"
      >
        {backendCurrencies.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="text-sm underline">
          Set
        </button>
      </noscript>
    </form>
  );
}
