'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const SECTIONS = [
  {
    href: '/procurement',
    label: 'Purchase orders',
    /** The list lives at the section root; its detail pages do not. */
    matches: (pathname: string) =>
      pathname === '/procurement' ||
      pathname.startsWith('/procurement/purchase-orders'),
  },
  {
    href: '/procurement/suppliers',
    label: 'Suppliers',
    matches: (pathname: string) =>
      pathname.startsWith('/procurement/suppliers'),
  },
];

/** Switches between the two halves of procurement. */
export function ProcurementNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Procurement" className="flex gap-1 border-b">
      {SECTIONS.map((section) => {
        const isActive = section.matches(pathname);
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
              isActive
                ? 'border-primary text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
