'use client';

import { useEffect } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * The fallback for anything a page did not catch itself.
 *
 * Pages read the API inside try/catch and show an `ApiErrorNotice` in place,
 * so reaching this means something unexpected — a render bug, or a failure
 * outside those reads. In production a server error's message is withheld
 * from the browser, so the digest is what ties this screen to the server log.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          This page could not be shown
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Something went wrong while loading it. Trying again often clears a
          passing problem; if it keeps happening, quote the reference below.
        </p>
      </div>
      {error.digest ? (
        <p className="text-muted-foreground font-mono text-xs">
          Reference {error.digest}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={() => retry()}>
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back to overview</Link>
        </Button>
      </div>
    </div>
  );
}
