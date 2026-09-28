import { describe, expect, it } from 'vitest';

import {
  addFieldError,
  optionalText,
  optionalWholeNumber,
  readIndexedRows,
  rowField,
  wholeNumber,
} from './form-rows';

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) {
    data.append(key, value);
  }
  return data;
}

describe('readIndexedRows', () => {
  it('regroups flat inputs into rows, in index order, keeping gaps', () => {
    expect(
      readIndexedRows(
        form([
          ['lines.3.variantId', 'b'],
          ['lines.0.variantId', 'a'],
          ['lines.0.orderedQuantity', ' 2 '],
          ['notes', 'ignored'],
          ['other.0.variantId', 'ignored'],
        ]),
        'lines',
      ),
    ).toEqual([
      { index: 0, fields: { variantId: 'a', orderedQuantity: '2' } },
      { index: 3, fields: { variantId: 'b' } },
    ]);
  });

  it('treats the prefix literally rather than as a pattern', () => {
    expect(
      readIndexedRows(form([['linesX0.variantId', 'a']]), 'lines.'),
    ).toEqual([]);
  });
});

describe('rowField', () => {
  it('names one input of one row', () => {
    expect(rowField('lines', 3, 'unitCost')).toBe('lines.3.unitCost');
  });
});

describe('optionalText', () => {
  it('trims, and treats blank or missing as not sent', () => {
    expect(optionalText('  x ')).toBe('x');
    expect(optionalText('   ')).toBeUndefined();
    expect(optionalText(null)).toBeUndefined();
  });
});

describe('wholeNumber', () => {
  it('accepts whole numbers at or above the minimum', () => {
    expect(wholeNumber('12')).toBe(12);
    expect(wholeNumber('0')).toBe(0);
    expect(wholeNumber('1', 1)).toBe(1);
  });

  it('refuses blanks, decimals, negatives, and values under the minimum', () => {
    for (const value of ['', '1.5', '-1', 'abc', undefined]) {
      expect(wholeNumber(value)).toBeNaN();
    }
    expect(wholeNumber('0', 1)).toBeNaN();
  });
});

describe('optionalWholeNumber', () => {
  it('reads blank as not sent, and anything else as wholeNumber does', () => {
    expect(optionalWholeNumber('')).toBeUndefined();
    expect(optionalWholeNumber(undefined)).toBeUndefined();
    expect(optionalWholeNumber('4')).toBe(4);
    expect(optionalWholeNumber('x')).toBeNaN();
  });
});

describe('addFieldError', () => {
  it('appends to a field, creating its list on first use', () => {
    const errors: Record<string, string[]> = {};
    addFieldError(errors, 'a', 'one');
    addFieldError(errors, 'a', 'two');
    expect(errors).toEqual({ a: ['one', 'two'] });
  });
});
