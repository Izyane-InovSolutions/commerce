const BASIS_POINTS = 10_000;

export type LineInput = {
  orderedQuantity: number;
  unitCostAmount: number;
  discountAmount: number;
  taxRateBasisPoints: number;
};

export type LineAmounts = {
  netAmount: number;
  taxAmount: number;
  grossAmount: number;
};

/**
 * All money is integer minor units. `netAmount` is what the supplier is owed
 * before tax; `taxAmount` rounds to the nearest minor unit rather than
 * truncating, so line-level tax never silently underestimates.
 */
export function computeLineAmounts(line: LineInput): LineAmounts {
  const netAmount = line.orderedQuantity * line.unitCostAmount - line.discountAmount;
  const taxAmount = Math.round((netAmount * line.taxRateBasisPoints) / BASIS_POINTS);
  const grossAmount = netAmount + taxAmount;

  return { netAmount, taxAmount, grossAmount };
}

export type OrderTotals = {
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
};

export function computeOrderTotals(
  lines: LineAmounts[],
  shippingAmount: number,
): OrderTotals {
  const subtotalAmount = lines.reduce((sum, line) => sum + line.netAmount, 0);
  const taxAmount = lines.reduce((sum, line) => sum + line.taxAmount, 0);

  return {
    subtotalAmount,
    taxAmount,
    totalAmount: subtotalAmount + taxAmount + shippingAmount,
  };
}
