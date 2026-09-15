import type { ReactNode } from 'react';
import Link from 'next/link';

import { DashboardNav } from '@/components/dashboard-nav';
import { PlatformMark } from '@/components/platform-mark';
import { UserMenu } from '@/components/user-menu';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/lib/session';

/**
 * Portal layout.
 *
 * Section navigation only appears once someone is signed in, so the sign-in
 * page is not framed by links that would bounce them straight back.
 */
export async function DashboardShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <PlatformMark />
            <span className="text-base font-semibold tracking-tight">
              Commerce Admin
            </span>
          </Link>
          <Badge variant="secondary">Admin portal</Badge>
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

      <footer className="mt-auto border-t px-4 py-4 text-sm text-muted-foreground">
        <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
          <span>
            Every privileged action recorded here raises an audit event.
          </span>
          <span>
            &copy; {new Date().getFullYear()} Commerce Admin. All rights
            reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}
