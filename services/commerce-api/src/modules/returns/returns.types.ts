import { Prisma } from '@prisma/client';

export const RETURN_REQUEST_INCLUDE = {
  items: true,
  receipts: { include: { lines: true } },
  inspections: { include: { lines: true } },
  events: true,
  refundCases: true,
} satisfies Prisma.ReturnRequestInclude;

export type ReturnRequestWithDetail = Prisma.ReturnRequestGetPayload<{
  include: typeof RETURN_REQUEST_INCLUDE;
}>;

export type ReturnPage = {
  items: ReturnRequestWithDetail[];
  total: number;
  page: number;
  limit: number;
};

export type ItemEligibilityView = {
  orderItemId: string;
  returnable: boolean;
  reason?: string;
  returnWindowDays: number;
  totalRemainingQuantity: number;
  chunks: {
    shipmentLineId: string;
    deliveredAt: Date;
    eligibleUntil: Date;
    remainingQuantity: number;
  }[];
};
