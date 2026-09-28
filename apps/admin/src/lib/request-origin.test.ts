import { describe, expect, it } from 'vitest';

import { hasValidMutationOrigin } from './request-origin';

describe('hasValidMutationOrigin', () => {
  it('allows safe requests without an Origin header', () => {
    expect(
      hasValidMutationOrigin('GET', null, 'https://commerce.example'),
    ).toBe(true);
  });

  it('allows an exact same-origin mutation', () => {
    expect(
      hasValidMutationOrigin(
        'POST',
        'https://commerce.example',
        'https://commerce.example',
      ),
    ).toBe(true);
  });

  it('rejects missing, cross-origin, and lookalike mutation origins', () => {
    expect(
      hasValidMutationOrigin('POST', null, 'https://commerce.example'),
    ).toBe(false);
    expect(
      hasValidMutationOrigin(
        'PATCH',
        'https://evil.example',
        'https://commerce.example',
      ),
    ).toBe(false);
    expect(
      hasValidMutationOrigin(
        'DELETE',
        'https://commerce.example.evil.test',
        'https://commerce.example',
      ),
    ).toBe(false);
  });
});
