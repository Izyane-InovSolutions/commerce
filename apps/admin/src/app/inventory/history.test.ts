import { describe, expect, it } from 'vitest';

import {
  isBelowReorderPoint,
  movementEffect,
  pageSlice,
  parseHistoryQuery,
} from './history';
import { warehouseDeleteBlocker } from './warehouse-rules';

describe('parseHistoryQuery', () => {
  it('defaults to the first page of movements, unfiltered', () => {
    expect(parseHistoryQuery({})).toEqual({
      view: 'movements',
      type: undefined,
      status: undefined,
      page: 1,
    });
  });

  it('reads a known view, filter and page', () => {
    expect(
      parseHistoryQuery({
        view: 'reservations',
        status: 'ACTIVE',
        type: 'RECEIPT',
        page: '3',
      }),
    ).toEqual({
      view: 'reservations',
      type: 'RECEIPT',
      status: 'ACTIVE',
      page: 3,
    });
  });

  it('drops values the API would not recognise', () => {
    expect(
      parseHistoryQuery({ view: 'nope', type: 'receipt', page: '-2' }),
    ).toEqual({
      view: 'movements',
      type: undefined,
      status: undefined,
      page: 1,
    });
    expect(parseHistoryQuery({ page: '1.5' }).page).toBe(1);
  });
});

describe('pageSlice', () => {
  const rows = Array.from({ length: 45 }, (_, index) => index);

  it('cuts the requested page', () => {
    expect(pageSlice(rows, 2, 20)).toEqual({
      items: rows.slice(20, 40),
      page: 2,
      total: 45,
      totalPages: 3,
    });
  });

  it('clamps a page past the end back to the last one', () => {
    const slice = pageSlice(rows, 9, 20);
    expect(slice.page).toBe(3);
    expect(slice.items).toEqual(rows.slice(40));
  });

  it('keeps one empty page for an empty list', () => {
    expect(pageSlice([], 4, 20)).toEqual({
      items: [],
      page: 1,
      total: 0,
      totalPages: 1,
    });
  });
});

describe('isBelowReorderPoint', () => {
  it('flags a record at or under its reorder point', () => {
    expect(isBelowReorderPoint({ available: 5, reorderPoint: 5 })).toBe(true);
    expect(isBelowReorderPoint({ available: 2, reorderPoint: 5 })).toBe(true);
    expect(isBelowReorderPoint({ available: 6, reorderPoint: 5 })).toBe(false);
  });

  it('treats a zero reorder point as unset', () => {
    expect(isBelowReorderPoint({ available: 0, reorderPoint: 0 })).toBe(false);
  });
});

describe('warehouseDeleteBlocker', () => {
  const warehouseId = 'wh-1';

  it('allows a warehouse that never held a record', () => {
    expect(
      warehouseDeleteBlocker(warehouseId, [
        { warehouseId: 'wh-2', onHand: 10 },
      ]),
    ).toBeNull();
  });

  it('refuses one holding stock, counting its units', () => {
    expect(
      warehouseDeleteBlocker(warehouseId, [
        { warehouseId, onHand: 3 },
        { warehouseId, onHand: 1 },
      ]),
    ).toMatch(/holds 4 units across 2 stock records/);
  });

  it('refuses one whose records are empty but still carry history', () => {
    expect(
      warehouseDeleteBlocker(warehouseId, [{ warehouseId, onHand: 0 }]),
    ).toMatch(/has 1 stock record\./);
  });
});

describe('movementEffect', () => {
  it('signs each movement by what it does to the counters', () => {
    expect(movementEffect('RECEIPT', 5)).toBe('On hand +5');
    expect(movementEffect('RETURN', 1)).toBe('On hand +1');
    expect(movementEffect('ADJUSTMENT', -3)).toBe('On hand −3');
    expect(movementEffect('ADJUSTMENT', 2)).toBe('On hand +2');
    expect(movementEffect('RESERVATION', 2)).toBe('Reserved +2');
    expect(movementEffect('RELEASE', 2)).toBe('Reserved −2');
    expect(movementEffect('COMMITMENT', 2)).toBe('On hand −2, reserved −2');
  });
});
