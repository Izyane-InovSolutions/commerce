import type { GoodsReceipt, GoodsReceiptLine } from '@prisma/client';

export type GoodsReceiptWithLines = GoodsReceipt & {
  lines: GoodsReceiptLine[];
};
