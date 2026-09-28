import type {
  BackendAdminProduct,
  BackendCreateSupplierInput,
  BackendGoodsReceiptLineInput,
  BackendPurchaseOrder,
  BackendPurchaseOrderLine,
  BackendPurchaseOrderLineInput,
  BackendPurchaseOrderStatus,
  BackendRole,
  BackendSupplier,
  BackendUpdateSupplierInput,
} from '@commerce/contracts';

import {
  addFieldError,
  optionalText,
  optionalWholeNumber,
  rowField,
  wholeNumber,
  type FormRow,
} from './form-rows';
import { toMinor } from './money';

/*
 * The procurement arithmetic and state rules the admin pages lean on. The
 * API is the authority on every one of them — this exists so a form can say
 * what is wrong before a round trip, and so a page only offers the actions
 * the API would accept.
 */

const BASIS_POINTS = 10_000;

/** Mirrors `computeLineAmounts` in the API's purchase-order-math. */
export function computeLineAmounts(line: {
  orderedQuantity: number;
  unitCostAmount: number;
  discountAmount: number;
  taxRateBasisPoints: number;
}): { netAmount: number; taxAmount: number; grossAmount: number } {
  const netAmount =
    line.orderedQuantity * line.unitCostAmount - line.discountAmount;
  const taxAmount = Math.round(
    (netAmount * line.taxRateBasisPoints) / BASIS_POINTS,
  );
  return { netAmount, taxAmount, grossAmount: netAmount + taxAmount };
}

/** Mirrors `computeOrderTotals`: shipping is added once, untaxed. */
export function computeOrderTotals(
  lines: { netAmount: number; taxAmount: number }[],
  shippingAmount: number,
): { subtotalAmount: number; taxAmount: number; totalAmount: number } {
  const subtotalAmount = lines.reduce((sum, line) => sum + line.netAmount, 0);
  const taxAmount = lines.reduce((sum, line) => sum + line.taxAmount, 0);
  return {
    subtotalAmount,
    taxAmount,
    totalAmount: subtotalAmount + taxAmount + shippingAmount,
  };
}

/**
 * "16" or "16.5" percent into basis points (1600, 1650). At most two decimal
 * places, 0–100; anything else is `NaN`.
 */
export function percentToBasisPoints(value: string): number {
  const text = value.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return Number.NaN;
  const basisPoints = Math.round(Number(text) * 100);
  return basisPoints <= BASIS_POINTS ? basisPoints : Number.NaN;
}

/** Basis points back to a percent string for a form's default value. */
export function basisPointsToPercent(basisPoints: number): string {
  return (basisPoints / 100).toString();
}

/** What is still expected on a line — never negative. */
export function outstandingQuantity(
  line: Pick<
    BackendPurchaseOrderLine,
    'orderedQuantity' | 'receivedQuantity' | 'cancelledQuantity'
  >,
): number {
  return Math.max(
    0,
    line.orderedQuantity - line.receivedQuantity - line.cancelledQuantity,
  );
}

export function receiptProgress(lines: BackendPurchaseOrderLine[]): {
  ordered: number;
  received: number;
  cancelled: number;
  outstanding: number;
} {
  return lines.reduce(
    (totals, line) => ({
      ordered: totals.ordered + line.orderedQuantity,
      received: totals.received + line.receivedQuantity,
      cancelled: totals.cancelled + line.cancelledQuantity,
      outstanding: totals.outstanding + outstandingQuantity(line),
    }),
    { ordered: 0, received: 0, cancelled: 0, outstanding: 0 },
  );
}

export type ParsedRows<T> = {
  lines: T[];
  fieldErrors: Record<string, string[]>;
  /** A problem with the rows as a whole, rather than any one field. */
  formError?: string;
};

/**
 * Purchase-order lines as the create/edit form posts them — money in major
 * units, tax as a percent — into the API's minor-unit, basis-point shape.
 * A row with neither a variant nor a quantity is an unused blank and is
 * skipped rather than flagged.
 */
export function parsePurchaseOrderLines(
  rows: FormRow[],
  prefix = 'lines',
): ParsedRows<BackendPurchaseOrderLineInput> {
  const fieldErrors: Record<string, string[]> = {};
  const lines: BackendPurchaseOrderLineInput[] = [];

  for (const { index, fields } of rows) {
    const field = (name: string) => rowField(prefix, index, name);
    if (!fields.variantId && !fields.orderedQuantity && !fields.unitCost) {
      continue;
    }

    const before = Object.keys(fieldErrors).length;

    if (!fields.variantId) {
      addFieldError(fieldErrors, field('variantId'), 'Choose a variant.');
    }

    const orderedQuantity = wholeNumber(fields.orderedQuantity, 1);
    if (Number.isNaN(orderedQuantity)) {
      addFieldError(
        fieldErrors,
        field('orderedQuantity'),
        'Enter a whole quantity of at least 1.',
      );
    }

    const unitCostAmount = toMinor(fields.unitCost ?? '');
    if (
      !fields.unitCost ||
      Number.isNaN(unitCostAmount) ||
      unitCostAmount < 0
    ) {
      addFieldError(
        fieldErrors,
        field('unitCost'),
        'Enter a unit cost of zero or more.',
      );
    }

    const discountAmount = fields.discount ? toMinor(fields.discount) : 0;
    if (Number.isNaN(discountAmount) || discountAmount < 0) {
      addFieldError(
        fieldErrors,
        field('discount'),
        'Enter a discount of zero or more.',
      );
    } else if (
      !Number.isNaN(orderedQuantity) &&
      !Number.isNaN(unitCostAmount) &&
      discountAmount > orderedQuantity * unitCostAmount
    ) {
      addFieldError(
        fieldErrors,
        field('discount'),
        'The discount is larger than the line itself.',
      );
    }

    const taxRateBasisPoints = fields.taxPercent
      ? percentToBasisPoints(fields.taxPercent)
      : 0;
    if (Number.isNaN(taxRateBasisPoints)) {
      addFieldError(
        fieldErrors,
        field('taxPercent'),
        'Enter a tax rate between 0 and 100%, at most two decimals.',
      );
    }

    const packSize = optionalWholeNumber(fields.packSize, 1);
    if (packSize !== undefined && Number.isNaN(packSize)) {
      addFieldError(
        fieldErrors,
        field('packSize'),
        'Pack size is a whole number of at least 1.',
      );
    }

    if (Object.keys(fieldErrors).length > before) continue;

    lines.push({
      variantId: fields.variantId!,
      supplierSku: optionalText(fields.supplierSku),
      packSize,
      orderedQuantity,
      unitCostAmount,
      discountAmount,
      taxRateBasisPoints,
    });
  }

  const formError =
    lines.length === 0 && Object.keys(fieldErrors).length === 0
      ? 'Add at least one line.'
      : undefined;

  return { lines, fieldErrors, formError };
}

/**
 * Goods-receipt lines as the receive form posts them: accepted, rejected,
 * and damaged per purchase-order line. Delivered is their sum by
 * construction, so the API's reconciliation rule can never fail on a
 * mistyped fourth number. A row that received nothing is skipped.
 *
 * Accepting more than is outstanding is an over-receipt: refused unless the
 * row asks for it to be authorized *and* the viewer may authorize one (the
 * API only lets an ADMIN), in which case the excess is authorized exactly.
 */
export function parseReceiptLines(
  rows: FormRow[],
  poLines: BackendPurchaseOrderLine[],
  options: { canAuthorizeExcess: boolean },
  prefix = 'receipt',
): ParsedRows<BackendGoodsReceiptLineInput> {
  const fieldErrors: Record<string, string[]> = {};
  const lines: BackendGoodsReceiptLineInput[] = [];
  const poLinesById = new Map(poLines.map((line) => [line.id, line]));

  for (const { index, fields } of rows) {
    const field = (name: string) => rowField(prefix, index, name);
    const poLine = poLinesById.get(fields.purchaseOrderLineId ?? '');
    if (!poLine) {
      addFieldError(
        fieldErrors,
        field('acceptedQuantity'),
        'This line is no longer on the purchase order. Reload and try again.',
      );
      continue;
    }

    const counts = {
      acceptedQuantity: optionalWholeNumber(fields.acceptedQuantity) ?? 0,
      rejectedQuantity: optionalWholeNumber(fields.rejectedQuantity) ?? 0,
      damagedQuantity: optionalWholeNumber(fields.damagedQuantity) ?? 0,
    };

    let invalid = false;
    for (const [name, value] of Object.entries(counts)) {
      if (Number.isNaN(value)) {
        addFieldError(fieldErrors, field(name), 'Enter a whole number.');
        invalid = true;
      }
    }
    if (invalid) continue;

    const deliveredQuantity =
      counts.acceptedQuantity +
      counts.rejectedQuantity +
      counts.damagedQuantity;
    if (deliveredQuantity === 0) continue;

    const outstanding = outstandingQuantity(poLine);
    const excess = counts.acceptedQuantity - outstanding;
    let authorizedExcessQty = 0;
    if (excess > 0) {
      if (fields.authorizeExcess !== 'on') {
        addFieldError(
          fieldErrors,
          field('acceptedQuantity'),
          `Only ${outstanding} still outstanding — accepting more is an over-receipt.`,
        );
        continue;
      }
      if (!options.canAuthorizeExcess) {
        addFieldError(
          fieldErrors,
          field('acceptedQuantity'),
          'Only an administrator can authorize an over-receipt.',
        );
        continue;
      }
      authorizedExcessQty = excess;
    }

    const discrepancyReason = optionalText(fields.discrepancyReason);
    const hasDiscrepancy =
      counts.rejectedQuantity > 0 || counts.damagedQuantity > 0 || excess > 0;
    if (hasDiscrepancy && !discrepancyReason) {
      addFieldError(
        fieldErrors,
        field('discrepancyReason'),
        'Say why — rejected, damaged, and over-received stock needs a reason.',
      );
      continue;
    }

    lines.push({
      purchaseOrderLineId: poLine.id,
      deliveredQuantity,
      ...counts,
      authorizedExcessQty: authorizedExcessQty || undefined,
      discrepancyReason,
    });
  }

  const formError =
    lines.length === 0 && Object.keys(fieldErrors).length === 0
      ? 'Enter a quantity against at least one line.'
      : undefined;

  return { lines, fieldErrors, formError };
}

export type PurchaseOrderAction =
  | 'edit'
  | 'submit'
  | 'returnToDraft'
  | 'approve'
  | 'reject'
  | 'place'
  | 'cancel'
  | 'closeShort'
  | 'revise'
  | 'receive';

export type PurchaseOrderActionState = {
  action: PurchaseOrderAction;
  /** Why the action is shown but can't be taken by this viewer. */
  blockedReason?: string;
};

/** Mirrors `PURCHASE_ORDER_TRANSITIONS` plus the service-level side rules. */
const ACTIONS_BY_STATUS: Record<
  BackendPurchaseOrderStatus,
  PurchaseOrderAction[]
> = {
  DRAFT: ['edit', 'submit', 'cancel'],
  SUBMITTED: ['approve', 'reject', 'returnToDraft'],
  APPROVED: ['place', 'revise', 'cancel'],
  REJECTED: [],
  ORDERED: ['receive', 'revise', 'cancel'],
  PARTIALLY_RECEIVED: ['receive', 'closeShort'],
  RECEIVED: [],
  CLOSED_SHORT: [],
  CANCELLED: [],
};

/**
 * Every action the purchase order's status allows, each marked with why this
 * viewer can't take it where that applies: approve and reject are ADMIN-only,
 * nobody approves a PO they created, and one with posted receipts can only
 * be closed short, not cancelled.
 */
export function purchaseOrderActions(
  po: Pick<BackendPurchaseOrder, 'status' | 'createdByUserId'>,
  viewer: { id: string; role: BackendRole },
  options: { hasPostedReceipts: boolean },
): PurchaseOrderActionState[] {
  const isAdmin = viewer.role === 'ADMIN';

  return ACTIONS_BY_STATUS[po.status].map((action) => {
    if ((action === 'approve' || action === 'reject') && !isAdmin) {
      return {
        action,
        blockedReason: 'Only an administrator can approve or reject.',
      };
    }
    if (action === 'approve' && po.createdByUserId === viewer.id) {
      return {
        action,
        blockedReason:
          'You created this purchase order, so someone else has to approve it.',
      };
    }
    if (action === 'cancel' && options.hasPostedReceipts) {
      return {
        action,
        blockedReason:
          'Stock has already been received against it — close it short instead.',
      };
    }
    return { action };
  });
}

/** Whether edits, receipts, and approvals are all over for this PO. */
export function isClosedPurchaseOrder(
  status: BackendPurchaseOrderStatus,
): boolean {
  return ACTIONS_BY_STATUS[status].length === 0;
}

export type PurchaseOrderHeader = {
  supplierId: string;
  warehouseId: string;
  currency: string;
  shippingAmount: number;
  /** `YYYY-MM-DD`, which the API's `IsDateString` accepts as it is. */
  expectedDeliveryDate?: string;
  notes: string;
};

/**
 * The purchase order's own fields, as the create/edit form posts them.
 * `notes` stays a string even when blank: on an edit, the API reads a
 * missing field as "leave it", so sending `''` is the only way to clear it.
 */
export function parsePurchaseOrderHeader(formData: FormData): {
  header: PurchaseOrderHeader;
  fieldErrors: Record<string, string[]>;
} {
  const fieldErrors: Record<string, string[]> = {};
  const text = (name: string) => String(formData.get(name) ?? '').trim();

  const supplierId = text('supplierId');
  if (!supplierId)
    addFieldError(fieldErrors, 'supplierId', 'Choose a supplier.');

  const warehouseId = text('warehouseId');
  if (!warehouseId) {
    addFieldError(
      fieldErrors,
      'warehouseId',
      'Choose a warehouse to deliver to.',
    );
  }

  const currency = text('currency').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    addFieldError(fieldErrors, 'currency', 'Choose a currency.');
  }

  const shipping = text('shipping');
  const shippingAmount = shipping === '' ? 0 : toMinor(shipping);
  if (Number.isNaN(shippingAmount) || shippingAmount < 0) {
    addFieldError(
      fieldErrors,
      'shipping',
      'Enter a shipping cost of zero or more.',
    );
  }

  const expectedDeliveryDate = optionalText(text('expectedDeliveryDate'));
  if (
    expectedDeliveryDate !== undefined &&
    !isCalendarDate(expectedDeliveryDate)
  ) {
    addFieldError(
      fieldErrors,
      'expectedDeliveryDate',
      'Enter a date as YYYY-MM-DD.',
    );
  }

  return {
    header: {
      supplierId,
      warehouseId,
      currency,
      shippingAmount,
      expectedDeliveryDate,
      notes: text('notes'),
    },
    fieldErrors,
  };
}

/** A real `YYYY-MM-DD` date — `2026-02-30` is refused, not rolled over. */
function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Loose on purpose — the API's `IsEmail` is the real check. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SupplierTerms = Pick<
  BackendCreateSupplierInput,
  | 'paymentTermsDays'
  | 'leadTimeDays'
  | 'minimumOrderAmount'
  | 'minimumOrderCurrency'
>;

/** Terms and the minimum order, shared by create and edit. */
function parseSupplierTerms(
  formData: FormData,
  currency: string,
  fieldErrors: Record<string, string[]>,
): SupplierTerms {
  const text = (name: string) => String(formData.get(name) ?? '').trim();
  const terms: SupplierTerms = {};

  for (const name of ['paymentTermsDays', 'leadTimeDays'] as const) {
    const days = optionalWholeNumber(text(name));
    if (days !== undefined && Number.isNaN(days)) {
      addFieldError(fieldErrors, name, 'Enter a whole number of days.');
    } else {
      terms[name] = days;
    }
  }

  // Money in major units on the form; the API wants minor units, and a
  // minimum is meaningless without its currency, so the two go together.
  const minimum = text('minimumOrderAmount');
  if (minimum !== '') {
    const amount = toMinor(minimum);
    if (Number.isNaN(amount) || amount < 0) {
      addFieldError(
        fieldErrors,
        'minimumOrderAmount',
        'Enter a minimum order of zero or more.',
      );
    } else {
      terms.minimumOrderAmount = amount;
      terms.minimumOrderCurrency = currency;
    }
  }

  return terms;
}

function checkEmail(
  email: string | undefined,
  fieldErrors: Record<string, string[]>,
): void {
  if (email !== undefined && !EMAIL_PATTERN.test(email)) {
    addFieldError(fieldErrors, 'contactEmail', 'Enter an email address.');
  }
}

/** Mirrors `CreateSupplierDto`: the code is uppercased before it is checked. */
export function supplierCreateInput(formData: FormData): {
  input: BackendCreateSupplierInput;
  fieldErrors: Record<string, string[]>;
} {
  const fieldErrors: Record<string, string[]> = {};
  const text = (name: string) => String(formData.get(name) ?? '').trim();

  const code = text('code').toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(code)) {
    addFieldError(
      fieldErrors,
      'code',
      'Use uppercase letters, digits, hyphens, or underscores.',
    );
  }

  const legalName = text('legalName');
  if (!legalName)
    addFieldError(fieldErrors, 'legalName', 'Enter the legal name.');

  const defaultCurrency = text('defaultCurrency').toUpperCase();
  if (!/^[A-Z]{3}$/.test(defaultCurrency)) {
    addFieldError(fieldErrors, 'defaultCurrency', 'Choose a currency.');
  }

  const contactEmail = optionalText(text('contactEmail'));
  checkEmail(contactEmail, fieldErrors);

  return {
    input: {
      code,
      legalName,
      tradingName: optionalText(text('tradingName')),
      registrationNumber: optionalText(text('registrationNumber')),
      taxNumber: optionalText(text('taxNumber')),
      contactEmail,
      contactPhone: optionalText(text('contactPhone')),
      defaultCurrency,
      ...parseSupplierTerms(formData, defaultCurrency, fieldErrors),
      notes: optionalText(text('notes')),
    },
    fieldErrors,
  };
}

/**
 * Mirrors `UpdateSupplierDto`. The API treats a missing field as "unchanged",
 * so a cleared text field is sent as `''` to actually clear it. The email
 * and the minimum order are the exceptions: the API validates both even
 * when empty, so either can be replaced but not removed.
 */
export function supplierUpdateInput(
  formData: FormData,
  supplier: Pick<BackendSupplier, 'version' | 'defaultCurrency'>,
): {
  input: BackendUpdateSupplierInput;
  fieldErrors: Record<string, string[]>;
} {
  const fieldErrors: Record<string, string[]> = {};
  const text = (name: string) => String(formData.get(name) ?? '').trim();

  const legalName = text('legalName');
  if (!legalName)
    addFieldError(fieldErrors, 'legalName', 'Enter the legal name.');

  const contactEmail = optionalText(text('contactEmail'));
  checkEmail(contactEmail, fieldErrors);

  return {
    input: {
      version: supplier.version,
      legalName,
      tradingName: text('tradingName'),
      registrationNumber: text('registrationNumber'),
      taxNumber: text('taxNumber'),
      contactEmail,
      contactPhone: text('contactPhone'),
      ...parseSupplierTerms(formData, supplier.defaultCurrency, fieldErrors),
      notes: text('notes'),
    },
    fieldErrors,
  };
}

export type VariantEntry = {
  product: string;
  sku: string;
  /** Archived variants still label old lines but are not offered for new ones. */
  archived: boolean;
};

/**
 * Purchase-order lines carry only a variant id, so names are joined in from
 * the catalog — the same way the inventory page labels its stock records.
 */
export function variantDirectory(
  products: Pick<BackendAdminProduct, 'name' | 'variants'>[],
): Map<string, VariantEntry> {
  const directory = new Map<string, VariantEntry>();
  for (const product of products) {
    for (const variant of product.variants) {
      directory.set(variant.id, {
        product: product.name,
        sku: variant.skuCode,
        archived: variant.status === 'ARCHIVED',
      });
    }
  }
  return directory;
}

/**
 * Variants to offer on a line, alphabetically. `keep` holds ids already on
 * the purchase order, so an edit never drops a line's choice just because
 * the variant has since been archived.
 */
export function variantOptions(
  directory: Map<string, VariantEntry>,
  keep: Iterable<string> = [],
): { value: string; label: string }[] {
  const kept = new Set(keep);
  return [...directory.entries()]
    .filter(([id, entry]) => !entry.archived || kept.has(id))
    .map(([id, entry]) => ({
      value: id,
      label: `${entry.product} — ${entry.sku}`,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
