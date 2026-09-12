'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const INTERVAL_MS = 5_000;
/** Roughly a mobile money prompt's lifetime; after that, waiting is futile. */
const MAX_WATCH_MS = 10 * 60_000;

/**
 * Keeps the order list in step with a payment being approved elsewhere.
 *
 * A mobile money charge is settled on the customer's phone, and the gateway
 * has no verified way to tell this system — so the page asks again, and the
 * server re-checks with the gateway as it re-renders. `router.refresh()`
 * re-runs the server component and merges the result without losing scroll
 * position or any client state on the page.
 *
 * Rendered only while something is actually waiting, so it stops on its own:
 * once every order has settled the server stops rendering this and the
 * interval is torn down with it.
 */
export function OrderStatusPoller() {
  const router = useRouter();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const startedAt = Date.now();

    const timer = setInterval(() => {
      if (Date.now() - startedAt > MAX_WATCH_MS) {
        setExpired(true);
        return;
      }

      // A background tab has nobody watching it; polling one only spends
      // someone's data and the gateway's rate limit.
      if (document.visibilityState === 'visible') {
        router.refresh();
      }
    }, INTERVAL_MS);

    return () => clearInterval(timer);
  }, [router]);

  return (
    <p
      className="text-muted-foreground text-xs"
      role="status"
      aria-live="polite"
    >
      {expired
        ? 'Still waiting. Reload the page to check again.'
        : 'Watching for payment confirmation…'}
    </p>
  );
}
