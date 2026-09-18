import type { RefundCaseStatus, ReturnReasonCode, ReturnStatus } from '@prisma/client';

export type SellerReturnRefundOutcome = {
  refundCaseId: string;
  status: RefundCaseStatus;
  amount: number;
  currency: string;
};

// One row per ReturnItem this seller owns. `status` is the parent
// ReturnRequest's lifecycle status - ReturnItem itself carries no status of
// its own, and a ReturnRequest can span multiple sellers (#30), so this
// projection never exposes the request's other sellers' items.
export type SellerReturnLineView = {
  returnItemId: string;
  returnRequestId: string;
  orderItemId: string;
  status: ReturnStatus;
  reasonCode: ReturnReasonCode;
  requestedQuantity: number;
  receivedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  refunds: SellerReturnRefundOutcome[];
  createdAt: Date;
};

export type SellerReturnPage = {
  items: SellerReturnLineView[];
  total: number;
  page: number;
  limit: number;
};
