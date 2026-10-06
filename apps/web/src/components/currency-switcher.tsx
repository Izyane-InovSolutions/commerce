'use client';

import { useRef } from 'react';
import { useFormStatus } from 'react-dom';

/** English name for a currency code, falling back to the code itself. */
function currencyName(code: string): string {
  try {
    return (
      new Intl.DisplayNames(['en'], { type: 'currency' }).of(code) ?? code
    );
  } catch {
    return code;
  }
}

function CurrencySelect({
  current,
  currencies,
  onChange,
}: {
  current: string;
  currencies: readonly string[];
  onChange: () => void;
}) {
  const { pending } = useFormStatus();

  return (
    <select
      id="currency-switcher"
      name="currency"
      defaultValue={current}
      disabled={pending}
      aria-busy={pending}
      onChange={onChange}
      className="rounded-md border border-white/30 bg-white/10 px-2 py-1 text-sm text-white"
    >
      {currencies.map((code) => (
        <option key={code} value={code} className="text-foreground">
          {code} — {currencyName(code)}
        </option>
      ))}
    </select>
  );
}

/**
 * The currency prices are shown in. Choosing one submits straight away —
 * the server action writes the cookie and re-renders with the API's prices
 * in that currency; nothing is converted here.
 *
 * With only one currency on offer there is nothing to choose, so it says
 * which one prices are in instead of showing a one-item menu.
 */
export function CurrencySwitcher({
  current,
  currencies,
  action,
}: {
  current: string;
  currencies: readonly string[];
  action: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  if (currencies.length < 2) {
    return <span>Prices in {current}</span>;
  }

  return (
    <form ref={formRef} action={action} className="flex items-center gap-2">
      <label htmlFor="currency-switcher">Currency</label>
      <CurrencySelect
        current={current}
        currencies={currencies}
        onChange={() => formRef.current?.requestSubmit()}
      />
      <noscript>
        <button type="submit" className="underline">
          Apply
        </button>
      </noscript>
    </form>
  );
}
