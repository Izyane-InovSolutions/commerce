'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import type { FormState } from '@/lib/form';
import { notificationHref } from '@/lib/notification-link';
import type { Notification } from '@/lib/notifications';
import { cn } from '@/lib/utils';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * One page of notifications, each markable as read on its own, and all of
 * them at once.
 *
 * "View" marks an unread notification read before following its link, so
 * the badge in the header agrees with what the shopper has actually opened.
 * Marking read is best-effort there — failing to mark it should not stop
 * them getting to what it was about.
 */
export function NotificationList({
  notifications,
  hasUnread,
  markRead,
  markAllRead,
}: {
  notifications: Notification[];
  hasUnread: boolean;
  markRead: (id: string) => Promise<FormState>;
  markAllRead: () => Promise<FormState>;
}) {
  const router = useRouter();
  const [result, setResult] = useState<FormState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(key: string, action: () => Promise<FormState | void>): void {
    setBusyId(key);
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome ?? null);
      setBusyId(null);
    });
  }

  return (
    <div className="space-y-4">
      {hasUnread ? (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => run('all', markAllRead)}
          >
            {busyId === 'all' ? 'Marking…' : 'Mark all as read'}
          </Button>
        </div>
      ) : null}

      {result?.message ? (
        <p
          role={result.status === 'error' ? 'alert' : 'status'}
          className={
            result.status === 'error'
              ? 'text-destructive text-sm'
              : 'text-muted-foreground text-sm'
          }
        >
          {result.message}
        </p>
      ) : null}

      <ul className="divide-y rounded-2xl border">
        {notifications.map((notification) => {
          const unread = notification.readAt === null;
          const href = notificationHref(notification.link);

          return (
            <li
              key={notification.id}
              className={cn(
                'flex items-start gap-3 px-4 py-3',
                unread && 'bg-blue-50/60 dark:bg-blue-950/30',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'mt-1.5 size-2 shrink-0 rounded-full',
                  unread ? 'bg-blue-600' : 'bg-transparent',
                )}
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className={cn('text-sm', unread && 'font-medium')}>
                  {unread ? <span className="sr-only">Unread: </span> : null}
                  {notification.title}
                </p>
                {notification.body ? (
                  <p className="text-muted-foreground text-sm text-pretty">
                    {notification.body}
                  </p>
                ) : null}
                <p className="text-muted-foreground text-xs">
                  {formatTimestamp(notification.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {href ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() =>
                      run(notification.id, async () => {
                        if (unread) {
                          try {
                            await markRead(notification.id);
                          } catch {
                            // Best-effort; see above.
                          }
                        }
                        router.push(href);
                      })
                    }
                  >
                    View
                  </Button>
                ) : null}
                {unread ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() =>
                      run(notification.id, () => markRead(notification.id))
                    }
                  >
                    {busyId === notification.id ? 'Marking…' : 'Mark read'}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
