import Link from 'next/link';

import type { User } from '@commerce/contracts';

import { Button } from '@/components/ui/button';

import { signOutAction } from '@/app/sign-in/actions';

export function UserMenu({ user }: { user: User | null }) {
  if (!user) {
    return (
      <Button size="sm" variant="outline" asChild>
        <Link href="/sign-in">Sign in</Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className="text-sm leading-tight font-medium">{user.name}</p>
        <p className="text-muted-foreground text-xs leading-tight">
          {user.email}
        </p>
      </div>
      <form action={signOutAction}>
        <Button size="sm" variant="ghost" type="submit">
          Sign out
        </Button>
      </form>
    </div>
  );
}
