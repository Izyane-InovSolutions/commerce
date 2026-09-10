import type { ReactNode } from 'react';
import Link from 'next/link';

import { DashboardNav } from '@/components/dashboard-nav';
import { Badge } from '@/components/ui/badge';

/**
 * Two-pane portal layout: persistent section navigation beside the active
 * section. The navigation collapses above the content on small screens.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Commerce Seller
          </Link>
          <Badge variant="secondary">Seller portal</Badge>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="border-b p-3 md:w-56 md:shrink-0 md:border-r md:border-b-0">
          <DashboardNav />
        </aside>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>

      <footer className="text-muted-foreground border-t px-4 py-4 text-sm">
        Every request is scoped to the resources your seller account owns.
      </footer>
    </div>
  );
}
