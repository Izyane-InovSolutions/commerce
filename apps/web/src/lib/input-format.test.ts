import { describe, expect, it } from 'vitest';

import {
  formatCardNumber,
  formatCvc,
  formatExpiry,
  formatZambianPhone,
} from './input-format';

describe('formatCardNumber', () => {
  it('groups digits into 4s', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
  });

  it('strips non-digit characters', () => {
    expect(formatCardNumber('4242-4242 4242.4242')).toBe('4242 4242 4242 4242');
  });

  it('caps at 16 digits', () => {
    expect(formatCardNumber('42424242424242429999')).toBe(
      '4242 4242 4242 4242',
    );
  });
});

describe('formatExpiry', () => {
  it('passes single digits through untouched', () => {
    expect(formatExpiry('1', '')).toBe('1');
  });

  it('inserts a slash once the month is complete while typing forward', () => {
    expect(formatExpiry('12', '1')).toBe('12/');
  });

  it('clamps a month above 12 down to 12', () => {
    expect(formatExpiry('13', '1')).toBe('12/');
  });

  it('clamps a month of 00 up to 01', () => {
    expect(formatExpiry('00', '0')).toBe('01/');
  });

  it('continues building the year after the slash', () => {
    expect(formatExpiry('12/3', '12/')).toBe('12/3');
    expect(formatExpiry('12/30', '12/3')).toBe('12/30');
  });

  it('builds a four-digit year, which is what the gateway takes', () => {
    expect(formatExpiry('12/2031', '12/203')).toBe('12/2031');
  });

  it('caps at 6 digits total', () => {
    expect(formatExpiry('12/20311', '12/2031')).toBe('12/2031');
  });

  it('does not re-insert the slash when backspacing past it', () => {
    // Displayed "12/", user presses backspace: the "/" is removed first.
    expect(formatExpiry('12', '12/')).toBe('12');
  });
});

describe('formatCvc', () => {
  it('strips non-digits', () => {
    expect(formatCvc('1a2b3c')).toBe('123');
  });

  // Four digits so an Amex code is not silently truncated.
  it('caps at 4', () => {
    expect(formatCvc('12345')).toBe('1234');
  });
});

describe('formatZambianPhone', () => {
  it('groups digits as 0XX XXX XXXX', () => {
    expect(formatZambianPhone('0971234567')).toBe('097 123 4567');
  });

  it('formats partial input without a trailing space', () => {
    expect(formatZambianPhone('09712')).toBe('097 12');
  });

  it('caps at 10 digits', () => {
    expect(formatZambianPhone('097123456799')).toBe('097 123 4567');
  });
});
