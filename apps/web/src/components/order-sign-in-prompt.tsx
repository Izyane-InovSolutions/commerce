import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * What an order, return or notifications page shows a visitor who is not
 * signed in: all of them are about one account's own records, which the API
 * will only serve to that account.
 */
export function OrderSignInPrompt({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground text-sm text-pretty">{message}</p>
      <Button asChild size="sm">
        <Link href="/account">Sign in</Link>
      </Button>
    </div>
  );
}
