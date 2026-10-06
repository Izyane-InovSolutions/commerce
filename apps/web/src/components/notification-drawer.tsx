'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';

import { NotificationList } from '@/components/notification-list';
import { Button } from '@/components/ui/button';
import {
  listRecentNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  type RecentNotifications,
} from '@/app/notifications/actions';
import type { FormState } from '@/lib/form';

/**
 * The header's bell: opens a drawer from the right with the newest
 * notifications, and a way through to the full page.
 *
 * The list is fetched each time the drawer opens, and again after marking
 * any read, so it never shows a stale unread state.
 */
export function NotificationDrawer({ unread }: { unread: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedOn, setOpenedOn] = useState(pathname);
  const [data, setData] = useState<RecentNotifications | null>(null);

  // Following a notification's "View" navigates away: close behind it.
  if (open && pathname !== openedOn) {
    setOpen(false);
  }

  async function load(): Promise<void> {
    setData(await listRecentNotificationsAction());
  }

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    if (next) {
      setOpenedOn(pathname);
      void load();
    }
  }

  async function markRead(id: string): Promise<FormState> {
    const outcome = await markNotificationReadAction(id);
    await load();
    return outcome;
  }

  async function markAllRead(): Promise<FormState> {
    const outcome = await markAllNotificationsReadAction();
    await load();
    return outcome;
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300"
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell />
          {unread ? (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] leading-none font-semibold text-white"
            >
              {unread}
            </span>
          ) : null}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className="bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l shadow-lg duration-300 sm:max-w-md">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <DialogPrimitive.Title className="text-base font-semibold">
              Notifications
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="text-muted-foreground focus-visible:ring-ring/50 rounded-md p-1 opacity-70 transition-opacity outline-none hover:opacity-100 focus-visible:ring-3">
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            Your most recent notifications
          </DialogPrimitive.Description>

          <div className="flex-1 overflow-y-auto p-4">
            {data === null ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : data.status === 'error' ? (
              <p role="alert" className="text-muted-foreground text-sm">
                {data.message}
              </p>
            ) : data.items.length === 0 ? (
              <p className="text-muted-foreground rounded-2xl border border-dashed px-4 py-6 text-center text-sm">
                No notifications yet. Updates about your orders and returns will
                appear here.
              </p>
            ) : (
              <NotificationList
                notifications={data.items}
                hasUnread={data.unread > 0}
                markRead={markRead}
                markAllRead={markAllRead}
              />
            )}
          </div>

          <div className="border-t p-4">
            <Button asChild className="w-full">
              <Link href="/notifications" onClick={() => setOpen(false)}>
                View all notifications
              </Link>
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
