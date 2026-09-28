'use client';

import { useRouter } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type SelectNavigationOption = {
  value: string;
  label: string;
  /** Where choosing this option goes — built on the server, so the client
   * never has to know how the page encodes its state in the URL. */
  href: string;
};

/**
 * A native `<select>` whose options are links.
 *
 * The listing's sort and filter state lives in the URL and is applied by
 * the API, so choosing an option is a navigation, not a local re-sort; this
 * is the only piece of it that needs the browser.
 */
export function SelectNavigation({
  id,
  label,
  value,
  options,
  scroll = false,
  className,
}: {
  id: string;
  label: ReactNode;
  value: string;
  options: SelectNavigationOption[];
  scroll?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <label
        htmlFor={id}
        className="text-muted-foreground flex items-center gap-1 text-xs font-medium"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        aria-busy={pending}
        onChange={(event) => {
          const option = options.find(
            (candidate) => candidate.value === event.target.value,
          );
          if (option) {
            startTransition(() => router.push(option.href, { scroll }));
          }
        }}
        className="border-input bg-background text-foreground focus:border-ring focus:ring-ring h-8 rounded-lg border px-2.5 py-1 text-xs font-medium shadow-xs focus:ring-1 focus:outline-hidden disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
