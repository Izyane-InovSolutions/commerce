import type { InventoryRecord } from '@prisma/client';

export type InventoryRecordView = InventoryRecord & { available: number };

export type SellerInventoryView = {
  id: string | null;
  offerId: string;
  variantId: string;
  sellerSku: string | null;
  listingTitle: string | null;
  onHand: number;
  reserved: number;
  available: number;
  version: number;
  updatedAt: Date | null;
};

export type ReserveOptions = {
  warehouseId?: string;
  holderType?: string;
  holderId?: string;
  ttlSeconds?: number;
  /**
   * Inside a caller's transaction that already locked its stock pools (see
   * `InventoryService.lockStockPools`), the records it locked. Allocation is
   * then restricted to them: a record created after that lock was not taken
   * in the global order and holds no stock this transaction could have
   * counted on, so it is ignored rather than locked out of order.
   */
  lockedRecordIds?: string[];
};
