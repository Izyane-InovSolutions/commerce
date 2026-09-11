'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import type { User } from '@commerce/contracts';

import { navigationFor } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/**
 * Section navigation, with a section's sub-views revealed once it is active.
 *
 * A section is active when the current path is the section itself or one of
 * its descendants, so a detail route keeps its parent lit.
 */
export function DashboardNav({ user }: { user: User }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = `${pathname}${searchParams.size > 0 ? `?${searchParams}` : ''}`;

  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {navigationFor(user).map(({ href, label, icon: Icon, children }) => {
        const isActive =
          href === '/' ? pathname === '/' : pathname.startsWith(href);

        return (
          <div key={href} className="contents md:block">
            <Link
              href={href}
              aria-current={isActive && !children ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </Link>

            {children && isActive ? (
              <ul className="mt-1 hidden md:block">
                {children.map((child) => (
                  <li key={child.href}>
                    <Link
                      href={child.href}
                      aria-current={current === child.href ? 'page' : undefined}
                      className={cn(
                        'ml-3 block rounded-lg border-l px-3 py-1 text-sm transition-colors',
                        current === child.href
                          ? 'border-foreground text-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {child.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
