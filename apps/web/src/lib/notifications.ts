import { ApiError } from '@commerce/api-client';

import { apiClient } from './api';
import type { SuccessEnvelope } from './catalog-types';

/**
 * The signed-in customer's in-app notifications — order updates, returns,
 * and the like — each optionally linking to where it is about.
 */

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  /** An in-app path, when the notification is about something to open. */
  link: string | null;
  /** Null while unread. */
  readAt: string | null;
  createdAt: string;
};

export type NotificationPage = {
  items: Notification[];
  total: number;
  page: number;
  limit: number;
};

/**
 * True when the API has no notifications routes at all (an older API
 * deployment): pages degrade to "not available yet" rather than an error.
 */
export function isNotificationsUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export async function listNotifications(options: {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<NotificationPage> {
  const response = await apiClient.get<SuccessEnvelope<NotificationPage>>(
    '/notifications',
    {
      query: {
        page: options.page ?? 1,
        limit: options.limit ?? 20,
        // Omitted rather than `false` for "everything": the API reads an
        // absent filter as no filter.
        unread: options.unreadOnly ? 'true' : undefined,
      },
      cache: 'no-store',
    },
  );
  return response.data;
}

/**
 * How many are unread, for the account menu's badge. Zero whenever it
 * cannot be told — a badge is not worth an error.
 */
export async function countUnreadNotifications(): Promise<number> {
  try {
    const page = await listNotifications({ limit: 1, unreadOnly: true });
    return page.total;
  } catch {
    return 0;
  }
}

export async function markNotificationRead(id: string): Promise<Notification> {
  const response = await apiClient.post<SuccessEnvelope<Notification>>(
    `/notifications/${id}/read`,
  );
  return response.data;
}

export async function markAllNotificationsRead(): Promise<number> {
  const response = await apiClient.post<SuccessEnvelope<{ updated: number }>>(
    '/notifications/read-all',
  );
  return response.data.updated;
}
