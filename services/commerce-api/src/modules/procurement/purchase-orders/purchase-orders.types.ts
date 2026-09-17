import type { PurchaseOrder, PurchaseOrderLine } from '@prisma/client';

export type PurchaseOrderWithLines = PurchaseOrder & {
  lines: PurchaseOrderLine[];
};

export type PurchaseOrderPage = {
  items: PurchaseOrderWithLines[];
  total: number;
  page: number;
  limit: number;
};
