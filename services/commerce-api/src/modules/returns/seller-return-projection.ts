import { Prisma, RefundCaseSource } from '@prisma/client';

import type { SellerReturnLineView } from './seller-returns.types';

// Shared shape read for a seller-scoped ReturnItem, whether pulled for one
// SellerOrder (seller-orders.service.ts's detail endpoint) or across all of
// a seller's orders (seller-returns.service.ts's list endpoint). Kept out of
// returns.service.ts on purpose - that file is the parallel #37 agent's
// in-flight territory too, per the command/mutation split.
export const SELLER_RETURN_ITEM_INCLUDE = {
  returnRequest: { select: { id: true, status: true } },
  orderItem: { select: { id: true } },
  receiptLines: { select: { quantity: true } },
  inspectionLines: { select: { acceptedQuantity: true, rejectedQuantity: true } },
  refundCaseItems: {
    select: {
      refundCase: {
        select: { id: true, status: true, amount: true, currency: true, source: true },
      },
    },
  },
} satisfies Prisma.ReturnItemInclude;

export type SellerReturnItemRow = Prisma.ReturnItemGetPayload<{
  include: typeof SELLER_RETURN_ITEM_INCLUDE;
}>;

export function projectSellerReturnItem(
  row: SellerReturnItemRow,
): SellerReturnLineView {
  const receivedQuantity = row.receiptLines.reduce(
    (sum, line) => sum + line.quantity,
    0,
  );
  const acceptedQuantity = row.inspectionLines.reduce(
    (sum, line) => sum + line.acceptedQuantity,
    0,
  );
  const rejectedQuantity = row.inspectionLines.reduce(
    (sum, line) => sum + line.rejectedQuantity,
    0,
  );
  const refunds = row.refundCaseItems
    .map((item) => item.refundCase)
    .filter((refundCase) => refundCase.source === RefundCaseSource.RETURN)
    .map((refundCase) => ({
      refundCaseId: refundCase.id,
      status: refundCase.status,
      amount: refundCase.amount,
      currency: refundCase.currency,
    }));

  return {
    returnItemId: row.id,
    returnRequestId: row.returnRequest.id,
    orderItemId: row.orderItem.id,
    status: row.returnRequest.status,
    reasonCode: row.reasonCode,
    requestedQuantity: row.quantity,
    receivedQuantity,
    acceptedQuantity,
    rejectedQuantity,
    refunds,
    createdAt: row.createdAt,
  };
}
