import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { withParams, type RawSearchParams } from '@/lib/search-params';

type PaginationProps = {
  pathname: string;
  params: RawSearchParams;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function Pagination({
  pathname,
  params,
  page,
  pageSize,
  total,
  totalPages,
}: PaginationProps) {
  if (total === 0) {
    return null;
  }

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        Showing {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          asChild={page > 1}
          disabled={page <= 1}
        >
          {page > 1 ? (
            <Link
              href={withParams(pathname, params, { page: page - 1 })}
              rel="prev"
            >
              Previous
            </Link>
          ) : (
            <span>Previous</span>
          )}
        </Button>
        <span className="text-muted-foreground text-sm">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          asChild={page < totalPages}
          disabled={page >= totalPages}
        >
          {page < totalPages ? (
            <Link
              href={withParams(pathname, params, { page: page + 1 })}
              rel="next"
            >
              Next
            </Link>
          ) : (
            <span>Next</span>
          )}
        </Button>
      </div>
    </div>
  );
}
