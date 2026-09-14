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
        className="h-8 rounded-lg border border-blue-300 bg-blue-50 px-2 text-sm text-blue-700 outline-none hover:bg-blue-100 focus-visible:border-blue-500 focus-visible:ring-3 focus-visible:ring-blue-500/50 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
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
