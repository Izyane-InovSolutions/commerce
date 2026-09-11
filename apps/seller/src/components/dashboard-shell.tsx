import type { ReactNode } from 'react';
import Link from 'next/link';

import { DashboardNav } from '@/components/dashboard-nav';
import { PlatformMark } from '@/components/platform-mark';
import { SellerLogo } from '@/components/seller-logo';
import { UserMenu } from '@/components/user-menu';
import { Badge } from '@/components/ui/badge';
import { getCurrentSellerAccount, getCurrentUser } from '@/lib/session';

/**
 * Portal layout.
 *
 * Once someone has a store, the header carries that store's identity rather
 * than the platform's — this is their shopfront's back office, and seeing
 * their own name is how they know which account they are working in.
 * Section navigation only appears when signed in, so the sign-in page is not
 * framed by links that would bounce them straight back.
 */
export async function DashboardShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const seller = await getCurrentSellerAccount();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          {seller ? (
            <Link href="/" className="flex min-w-0 items-center gap-2.5">
              <SellerLogo seller={seller} />
              <span className="min-w-0">
                <span className="block truncate text-base leading-tight font-semibold tracking-tight">
                  {seller.name}
                </span>
                <span className="text-muted-foreground block text-xs leading-tight">
                  Seller portal
                </span>
              </span>
            </Link>
          ) : (
            <>
              <Link href="/" className="flex items-center gap-2.5">
                <PlatformMark />
                <span className="text-base font-semibold tracking-tight">
                  Commerce Seller
                </span>
              </Link>
              <Badge variant="secondary">Seller portal</Badge>
            </>
          )}

          {seller && seller.status !== 'approved' ? (
            <Badge variant="destructive">
              {seller.status === 'suspended' ? 'Suspended' : seller.status}
            </Badge>
          ) : null}

          <div className="ml-auto">
            <UserMenu user={user} />
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        {user ? (
          <aside className="border-b p-3 md:w-56 md:shrink-0 md:border-r md:border-b-0">
            <DashboardNav user={user} />
          </aside>
        ) : null}
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>

      <footer className="text-muted-foreground border-t px-4 py-4 text-sm">
        Every request is scoped to the resources your seller account owns.
      </footer>
    </div>
  );
}
