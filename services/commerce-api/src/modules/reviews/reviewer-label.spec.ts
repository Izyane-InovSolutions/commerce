import { formatReviewerLabel } from './reviewer-label';

describe('formatReviewerLabel', () => {
  it('joins first name and last initial when both are present', () => {
    expect(formatReviewerLabel('Jane', 'Doe')).toBe('Jane D.');
  });

  it('falls back to "Verified customer" when last name is missing', () => {
    expect(formatReviewerLabel('Jane', null)).toBe('Verified customer');
    expect(formatReviewerLabel('Jane', undefined)).toBe('Verified customer');
  });

  it('falls back to "Verified customer" when first name is missing', () => {
    expect(formatReviewerLabel(null, 'Doe')).toBe('Verified customer');
    expect(formatReviewerLabel(undefined, 'Doe')).toBe('Verified customer');
  });

  it('falls back to "Verified customer" when both names are missing', () => {
    expect(formatReviewerLabel(null, null)).toBe('Verified customer');
    expect(formatReviewerLabel(undefined, undefined)).toBe('Verified customer');
  });

  it('falls back to "Verified customer" when a name is an empty or blank string', () => {
    expect(formatReviewerLabel('', 'Doe')).toBe('Verified customer');
    expect(formatReviewerLabel('Jane', '')).toBe('Verified customer');
    expect(formatReviewerLabel('   ', 'Doe')).toBe('Verified customer');
    expect(formatReviewerLabel('Jane', '   ')).toBe('Verified customer');
  });

  it('handles non-ASCII names', () => {
    expect(formatReviewerLabel('José', 'Ñuñez')).toBe('José Ñ.');
    expect(formatReviewerLabel('张', '伟')).toBe('张 伟.');
  });

  it('trims surrounding whitespace before combining', () => {
    expect(formatReviewerLabel('  Jane  ', '  Doe  ')).toBe('Jane D.');
  });
});
