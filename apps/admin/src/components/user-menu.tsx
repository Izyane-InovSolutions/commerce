import Link from 'next/link';

import type { BackendUser } from '@commerce/contracts';

import { Button } from '@/components/ui/button';

import { signOutAction } from '@/app/sign-in/actions';

export function UserMenu({ user }: { user: BackendUser | null }) {
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
        <p className="text-sm leading-tight font-medium">{user.email}</p>
        <p className="text-muted-foreground text-xs leading-tight">
          {user.role.toLowerCase()}
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
