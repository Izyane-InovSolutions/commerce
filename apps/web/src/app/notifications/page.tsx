import type { Metadata } from 'next';
import Link from 'next/link';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { NotificationList } from '@/components/notification-list';
import { OrderSignInPrompt } from '@/components/order-sign-in-prompt';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import {
  isNotificationsUnavailable,
  listNotifications,
  type NotificationPage,
} from '@/lib/notifications';
import { parsePage } from '@/lib/pagination';
import { getCurrentUser } from '@/lib/session';

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from './actions';

export const metadata: Metadata = {
  title: 'Notifications',
};

const PAGE_SIZE = 20;

function hrefFor(page: number, unreadOnly: boolean): string {
  const query = new URLSearchParams();
  if (unreadOnly) query.set('filter', 'unread');
  if (page > 1) query.set('page', String(page));
  const search = query.toString();
  return search ? `/notifications?${search}` : '/notifications';
}

export default async function NotificationsPage({
  searchParams,
}: PageProps<'/notifications'>) {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <OrderSignInPrompt
        title="Notifications"
        message="Sign in to see updates about your orders and returns."
      />
    );
  }

  const params = await searchParams;
  const page = parsePage(params.page);
  const unreadOnly = params.filter === 'unread';

  let result: NotificationPage;
  let unreadCount: number;

  try {
    // The unread total is its own read so "Mark all as read" knows whether
    // there is anything to mark even on the "All" view's later pages.
    [result, unreadCount] = await Promise.all([
      listNotifications({ page, limit: PAGE_SIZE, unreadOnly }),
      unreadOnly
        ? Promise.resolve(-1)
        : listNotifications({ limit: 1, unreadOnly: true }).then(
            (unread) => unread.total,
          ),
    ]);
    if (unreadOnly) {
      unreadCount = result.total;
    }
  } catch (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        {isNotificationsUnavailable(error) ? (
          <p className="text-muted-foreground rounded-2xl border border-dashed px-4 py-3 text-sm text-pretty">
            Notifications aren’t available yet. Updates about your orders and
            returns are on their own pages in the meantime.
          </p>
        ) : (
          <ApiErrorNotice error={error} />
        )}
        <Button asChild size="sm" variant="outline">
          <Link href="/account?tab=orders">Your orders</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-muted-foreground text-sm">
          {unreadCount > 0 ? `${unreadCount} unread` : 'You’re all caught up.'}
        </p>
      </div>

      <nav aria-label="Filter notifications" className="flex gap-1">
        <Button asChild size="sm" variant={unreadOnly ? 'ghost' : 'secondary'}>
          <Link
            href={hrefFor(1, false)}
            aria-current={unreadOnly ? undefined : 'page'}
          >
            All
          </Link>
        </Button>
        <Button asChild size="sm" variant={unreadOnly ? 'secondary' : 'ghost'}>
          <Link
            href={hrefFor(1, true)}
            aria-current={unreadOnly ? 'page' : undefined}
          >
            Unread
          </Link>
        </Button>
      </nav>

      {result.items.length === 0 ? (
        <p className="text-muted-foreground rounded-2xl border border-dashed px-4 py-6 text-center text-sm">
          {unreadOnly
            ? 'No unread notifications.'
            : 'No notifications yet. Updates about your orders and returns will appear here.'}
        </p>
      ) : (
        <NotificationList
          notifications={result.items}
          hasUnread={unreadCount > 0}
          markRead={markNotificationReadAction}
          markAllRead={markAllNotificationsReadAction}
        />
      )}

      <Pagination
        page={page}
        total={result.total}
        limit={result.limit || PAGE_SIZE}
        hrefForPage={(target) => hrefFor(target, unreadOnly)}
        label="Notification pages"
      />
    </div>
  );
}
