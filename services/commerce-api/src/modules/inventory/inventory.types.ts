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
};
