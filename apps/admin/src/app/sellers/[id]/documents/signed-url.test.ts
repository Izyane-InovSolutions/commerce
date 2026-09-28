import { describe, expect, it } from 'vitest';

import { documentProblemMessage, resolveSignedUrl } from './signed-url';

const API = 'http://localhost:3005/api/v1';

describe('resolveSignedUrl', () => {
  it('resolves an API-relative path against the API origin', () => {
    expect(
      resolveSignedUrl('/api/v1/media/abc/download?expires=1&signature=f', API)
        ?.href,
    ).toBe(
      'http://localhost:3005/api/v1/media/abc/download?expires=1&signature=f',
    );
  });

  it('passes an absolute URL through', () => {
    expect(
      resolveSignedUrl('https://bucket.example.com/doc.pdf?sig=1', API)?.href,
    ).toBe('https://bucket.example.com/doc.pdf?sig=1');
  });

  it('refuses a non-http scheme', () => {
    expect(resolveSignedUrl('javascript:alert(1)', API)).toBeNull();
  });
});

describe('documentProblemMessage', () => {
  it('explains the known problems and ignores anything else', () => {
    expect(documentProblemMessage('missing')).toMatch(/no longer available/);
    expect(documentProblemMessage('failed')).toMatch(/Try again/);
    expect(documentProblemMessage('other')).toBeNull();
    expect(documentProblemMessage(undefined)).toBeNull();
  });
});
