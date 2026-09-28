/**
 * Shown while a page's API reads are in flight.
 *
 * Every admin page is a server component that waits on the API before it
 * renders, so without this a slow read leaves the previous page on screen
 * with no sign anything is happening. The shape — a header, then a block of
 * rows — is the one nearly every section shares.
 */
export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="space-y-2" aria-hidden>
        <div className="bg-muted h-7 w-48 animate-pulse rounded-md" />
        <div className="bg-muted h-4 w-full max-w-md animate-pulse rounded-md" />
      </div>
      <div className="space-y-3 rounded-xl border p-4" aria-hidden>
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="bg-muted h-5 animate-pulse rounded-md"
            style={{ width: `${90 - index * 8}%` }}
          />
        ))}
      </div>
    </div>
  );
}
