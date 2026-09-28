'use server';

import { revalidatePath } from 'next/cache';

import { toFormState, type FormState } from '@/lib/form';
import {
  isNotificationsUnavailable,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/notifications';

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
    return isNotificationsUnavailable(error) ? unavailable() : toFormState(error);
  }

  revalidateNotifications();
  return { status: 'idle' };
}

export async function markAllNotificationsReadAction(): Promise<FormState> {
  try {
    await markAllNotificationsRead();
  } catch (error) {
    return isNotificationsUnavailable(error) ? unavailable() : toFormState(error);
  }

  revalidateNotifications();
  return { status: 'idle', message: 'All caught up.' };
}
