import {
  backendInventoryMovementTypes,
  backendReservationStatuses,
  type BackendInventoryMovementType,
  type BackendInventoryRecord,
  type BackendReservationStatus,
} from '@commerce/contracts';

import { readParam, type RawSearchParams } from '@/lib/search-params';

/**
 * Query handling for one stock record's history page.
 *
 * The movement and reservation reads take no filters and are not paged — the
 * API hands back every row, newest first — so both the filtering and the
 * paging happen here, the same way the catalog listing does it.
 */

export type HistoryView = 'movements' | 'reservations';

export type HistoryQuery = {
  view: HistoryView;
  /** Only meaningful on the movements view. */
  type: BackendInventoryMovementType | undefined;
  /** Only meaningful on the reservations view. */
  status: BackendReservationStatus | undefined;
  page: number;
};

function oneOf<T extends string>(
  allowed: readonly T[],
  value: string | undefined,
): T | undefined {
  return allowed.find((candidate) => candidate === value);
}

/**
 * Reads the history query from the address bar. Anything unusable falls back
 * to the default rather than failing the render, since the URL is editable.
 */
export function parseHistoryQuery(params: RawSearchParams): HistoryQuery {
  const requested = Number(readParam(params, 'page') ?? '1');

  return {
    view:
      readParam(params, 'view') === 'reservations'
        ? 'reservations'
        : 'movements',
    type: oneOf(backendInventoryMovementTypes, readParam(params, 'type')),
    status: oneOf(backendReservationStatuses, readParam(params, 'status')),
    page: Number.isInteger(requested) && requested > 0 ? requested : 1,
  };
}

export type PageSlice<T> = {
  items: T[];
  /** The page actually shown, clamped into range. */
  page: number;
  total: number;
  totalPages: number;
};

/** Cuts one page out of a full list, clamping a page past the end back in. */
export function pageSlice<T>(
  all: T[],
  requested: number,
  pageSize: number,
): PageSlice<T> {
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(requested, 1), totalPages);

  return {
    items: all.slice((page - 1) * pageSize, page * pageSize),
    page,
    total,
    totalPages,
  };
}

/**
 * Whether a record has fallen to its reorder point. A reorder point of zero
 * means none is set — otherwise every sold-out record would be flagged,
 * including ones nobody intends to restock.
 */
export function isBelowReorderPoint(
  record: Pick<BackendInventoryRecord, 'available' | 'reorderPoint'>,
): boolean {
  return record.reorderPoint > 0 && record.available <= record.reorderPoint;
}

function signed(quantity: number): string {
  return quantity < 0 ? `−${Math.abs(quantity)}` : `+${quantity}`;
}

/**
 * What a movement did to the record's counters.
 *
 * The API stores a plain count for everything but an adjustment, so the sign
 * — and which counter moved — comes from the type: a reservation holds stock
 * without moving it, a release gives the hold back, and a commitment is the
 * sale going through, taking the units off both.
 */
export function movementEffect(
  type: BackendInventoryMovementType,
  quantity: number,
): string {
  switch (type) {
    case 'RECEIPT':
    case 'RETURN':
      return `On hand ${signed(Math.abs(quantity))}`;
    case 'ADJUSTMENT':
      return `On hand ${signed(quantity)}`;
    case 'RESERVATION':
      return `Reserved ${signed(Math.abs(quantity))}`;
    case 'RELEASE':
      return `Reserved ${signed(-Math.abs(quantity))}`;
    case 'COMMITMENT':
      return `On hand ${signed(-Math.abs(quantity))}, reserved ${signed(-Math.abs(quantity))}`;
  }
}
