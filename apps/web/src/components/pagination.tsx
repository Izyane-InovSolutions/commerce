import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { pageCount, pageWindow } from '@/lib/pagination';
import { cn } from '@/lib/utils';

/**
 * Numbered page links for any server-paged list.
 *
 * Plain links rather than buttons with state: the page number lives in the
 * URL, so every page is shareable, and the server renders it directly.
 * Renders nothing when everything already fits on one page.
 */
export function Pagination({
  page,
  total,
  limit,
  hrefForPage,
  label = 'Pagination',
  scroll = true,
}: {
  page: number;
  total: number;
  limit: number;
  hrefForPage: (page: number) => string;
  label?: string;
  /** False for a list further down a page (e.g. reviews), so paging it
   * doesn't jump back to the top. */
  scroll?: boolean;
}) {
  const count = pageCount(total, limit);

  if (count <= 1) {
    return null;
  }

  const current = Math.min(page, count);

  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-center gap-1"
    >
      {current > 1 ? (
        <Button variant="ghost" size="sm" asChild>
          <Link href={hrefForPage(current - 1)} scroll={scroll} rel="prev">
            <ChevronLeft data-icon="inline-start" />
            Previous
          </Link>
        </Button>
      ) : null}

      {pageWindow(current, count).map((entry, index) =>
        entry === 'gap' ? (
          <span
            key={`gap-${index}`}
            className="text-muted-foreground px-2 text-sm"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <Button
            key={entry}
            variant={entry === current ? 'secondary' : 'ghost'}
            size="sm"
            asChild
            className={cn('min-w-8', entry === current && 'font-semibold')}
          >
            <Link
              href={hrefForPage(entry)}
              scroll={scroll}
              aria-current={entry === current ? 'page' : undefined}
              aria-label={`Page ${entry}`}
            >
              {entry}
            </Link>
          </Button>
        ),
      )}

      {current < count ? (
        <Button variant="ghost" size="sm" asChild>
          <Link href={hrefForPage(current + 1)} scroll={scroll} rel="next">
            Next
            <ChevronRight data-icon="inline-end" />
          </Link>
        </Button>
      ) : null}
    </nav>
  );
}
