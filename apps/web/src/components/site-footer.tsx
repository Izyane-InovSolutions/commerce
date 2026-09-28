import Link from 'next/link';

import { backendCurrencies } from '@commerce/contracts';

import { setCurrencyAction } from '@/app/currency/actions';
import { CurrencySwitcher } from '@/components/currency-switcher';
import { readCurrency } from '@/lib/currency-cookie';

/** Kept short: the side nav already carries the catalog, so the footer is
 * for the pages people look for at the bottom of a shop. */
const FOOTER_LINKS = [
  { href: '/help', label: 'Help' },
  { href: '/account?tab=orders', label: 'Your orders' },
  { href: '/returns', label: 'Returns' },
  { href: '/best-sellers', label: 'Best sellers' },
  { href: '/new-arrivals', label: 'New arrivals' },
  // The account page's "Become a seller" button hands the session off to the
  // seller portal (`/launch` would send a plain customer back home).
  { href: '/account', label: 'Sell on iZyane' },
] as const;

export async function SiteFooter() {
  const currency = await readCurrency();

  return (
    <footer className="mt-auto border-t">
      <nav
        aria-label="Footer"
        className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-6 gap-y-2 px-4 pt-6 text-sm sm:justify-start"
      >
        {FOOTER_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-muted-foreground hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm sm:flex-row">
        <span>
          iZyane Marketplace — retail and marketplace offers in one catalog.
        </span>
        <CurrencySwitcher
          current={currency}
          currencies={backendCurrencies}
          action={setCurrencyAction}
        />
        <span>
          &copy; {new Date().getFullYear()} iZyane. All rights reserved.
        </span>
      </div>
    </footer>
  );
}
