import type { Seller } from '@commerce/contracts';

import { cn } from '@/lib/utils';

/** Up to two initials, the way a person would abbreviate a store name. */
function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((word) => /[a-z0-9]/i.test(word))
      .slice(0, 2)
      .map((word) => word[0]!.toUpperCase())
      .join('') || '?'
  );
}

/**
 * A store's logo, falling back to a monogram.
 *
 * A seller has no logo until they upload one, which is the normal state for a
 * newly approved store — so the fallback is a designed state, not an error.
 */
export function SellerLogo({
  seller,
  className,
}: {
  seller: Pick<Seller, 'name' | 'logoUrl'>;
  className?: string;
}) {
  const shape = cn('size-7 shrink-0 rounded-lg', className);

  if (seller.logoUrl) {
    return (
      // A plain <img>: the logo is a small fixed-size square from whatever
      // origin the API reports, so next/image would buy nothing but a
      // remote-pattern entry per storage host.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={seller.logoUrl}
        alt=""
        width={28}
        height={28}
        className={cn(shape, 'bg-muted object-cover')}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        shape,
        'bg-muted text-muted-foreground grid place-items-center text-xs font-semibold',
      )}
    >
      {initials(seller.name)}
    </span>
  );
}
