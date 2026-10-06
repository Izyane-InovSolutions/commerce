import Link from 'next/link';
import Image from 'next/image';

import { backendCurrencies } from '@commerce/contracts';
import izyaneLogo from '@/assets/iZyane-w.png';
import { setCurrencyAction } from '@/app/currency/actions';
import { CurrencySwitcher } from '@/components/currency-switcher';
import { readCurrency } from '@/lib/currency-cookie';
import { pageFrame } from '@/lib/page-frame';

/** Kept short: the side nav already carries the catalog, so the footer is
 * for the pages people look for at the bottom of a shop. */
const FOOTER_LINKS = [
  { href: '/help', label: 'Help' },
  { href: '/account?tab=orders', label: 'Your orders' },
  { href: '/account?tab=returns', label: 'Returns' },
  { href: '/best-sellers', label: 'Best sellers' },
  { href: '/new-arrivals', label: 'New arrivals' },
  { href: '/stores', label: 'Stores' },
  // The account page's "Become a seller" button hands the session off to the
  // seller portal (`/launch` would send a plain customer back home).
  { href: '/account', label: 'Sell on iZyane' },
] as const;

export async function SiteFooter() {
  const currency = await readCurrency();

  return (
    <footer className="mt-auto border-t border-white/20 bg-primary text-white">
      <nav
        aria-label="Footer"
        className={`${pageFrame} flex flex-wrap justify-end gap-x-6 gap-y-2 pt-6 py-0 text-sm`}
      >
        {FOOTER_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-white/90 hover:text-white"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div
        className={`${pageFrame} flex flex-col items-center justify-between gap-2 py-6 pt-2 text-sm sm:flex-row`}
      >
        <span>
          <Link
            href="/"
            aria-label="iZyane Marketplace"
            className="flex items-center gap-0.5 text-base font-semibold tracking-tight"
          >
            <Image src={izyaneLogo} alt="" className="h-18  w-auto" priority />
          </Link>
        </span>
        <div className="flex flex-col items-end gap-2 self-end">
          <CurrencySwitcher
            current={currency}
            currencies={backendCurrencies}
            action={setCurrencyAction}
          />
          <span>
            &copy; {new Date().getFullYear()} iZyane. All rights reserved.
          </span>
        </div>
      </div>
    </footer>
  );
}
