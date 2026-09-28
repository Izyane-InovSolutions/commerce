import { describe, expect, it } from 'vitest';

import { notificationHref, unreadBadgeLabel } from './notification-link';

describe('notificationHref', () => {
  it('keeps an in-app path', () => {
    expect(notificationHref('/orders/abc')).toBe('/orders/abc');
    expect(notificationHref('/returns/abc?x=1')).toBe('/returns/abc?x=1');
  });

  it('drops anything that would leave the site, or nothing at all', () => {
    expect(notificationHref(null)).toBeNull();
    expect(notificationHref('')).toBeNull();
    expect(notificationHref('https://evil.example')).toBeNull();
    expect(notificationHref('//evil.example')).toBeNull();
    expect(notificationHref('javascript:alert(1)')).toBeNull();
  });
});

describe('unreadBadgeLabel', () => {
  it('shows nothing with nothing unread', () => {
    expect(unreadBadgeLabel(0)).toBeNull();
    expect(unreadBadgeLabel(-1)).toBeNull();
    expect(unreadBadgeLabel(Number.NaN)).toBeNull();
  });

  it('caps at 99+', () => {
    expect(unreadBadgeLabel(1)).toBe('1');
    expect(unreadBadgeLabel(99)).toBe('99');
    expect(unreadBadgeLabel(100)).toBe('99+');
  });
});
