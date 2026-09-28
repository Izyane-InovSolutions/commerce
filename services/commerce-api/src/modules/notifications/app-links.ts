import type { ConfigService } from '@nestjs/config';

import type { NotificationAudience } from './notifications.types';

// The apps' `next dev` ports (apps/web and apps/seller package.json).
export const DEFAULT_WEB_APP_URL = 'http://localhost:3001';
export const DEFAULT_SELLER_APP_URL = 'http://localhost:3003';

/**
 * Turns an in-app path into an absolute URL for use outside the app (an
 * email). Notifications store only the path, since the web inbox links
 * within its own origin.
 */
export function absoluteAppUrl(
  config: ConfigService,
  audience: NotificationAudience,
  path: string,
): string {
  const base =
    audience === 'seller'
      ? config.get<string>('SELLER_APP_URL') || DEFAULT_SELLER_APP_URL
      : config.get<string>('WEB_APP_URL') || DEFAULT_WEB_APP_URL;
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
