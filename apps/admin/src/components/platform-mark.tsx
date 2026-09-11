import { cn } from '@/lib/utils';

/**
 * The platform's own brand mark.
 *
 * Inline SVG rather than an asset: it needs no network request, scales
 * cleanly, and takes its colour from the surrounding text so it works in
 * light and dark without a second file. The counter is painted with the
 * page background so the mark reads as a cut-out in either theme.
 */
export function PlatformMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('size-7 shrink-0', className)}
      role="img"
      aria-label="Commerce"
    >
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path
        d="M22 11.6a7 7 0 1 0 0 8.8"
        fill="none"
        style={{ stroke: 'var(--background)' }}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
