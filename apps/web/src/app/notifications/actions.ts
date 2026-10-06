'use server';

import { revalidatePath } from 'next/cache';

import { toFormState, type FormState } from '@/lib/form';
import {
  isNotificationsUnavailable,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from '@/lib/notifications';

export type RecentNotifications =
  | { status: 'ok'; items: Notification[]; total: number; unread: number }
  | { status: 'error'; message: string };

/**
 * The newest few, for the header's drawer. Read when the drawer opens rather
 * than with every page render, so the header costs no extra request.
 */
export async function listRecentNotificationsAction(): Promise<RecentNotifications> {
  try {
    const [recent, unread] = await Promise.all([
      listNotifications({ limit: 10 }),
      listNotifications({ limit: 1, unreadOnly: true }),
    ]);
    return {
      status: 'ok',
      items: recent.items,
      total: recent.total,
      unread: unread.total,
    };
  } catch (error) {
    if (isNotificationsUnavailable(error)) {
      return {
        status: 'error',
        message: 'Notifications aren’t available yet.',
      };
    }
    return {
      status: 'error',
      message: toFormState(error).message ?? 'Couldn’t load notifications.',
    };
  }
}

/** The list, and the header's unread badge on every page. */
function revalidateNotifications(): void {
  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
}

function unavailable(): FormState {
  return {
    status: 'error',
    message: 'Notifications aren’t available right now.',
  };
}

export async function markNotificationReadAction(
  id: string,
): Promise<FormState> {
  try {
    await markNotificationRead(id);
  } catch (error) {
    return isNotificationsUnavailable(error)
      ? unavailable()
      : toFormState(error);
  }

  revalidateNotifications();
  return { status: 'idle' };
}

export async function markAllNotificationsReadAction(): Promise<FormState> {
  try {
    await markAllNotificationsRead();
  } catch (error) {
    return isNotificationsUnavailable(error)
      ? unavailable()
      : toFormState(error);
  }

  revalidateNotifications();
  return { status: 'idle', message: 'All caught up.' };
}
