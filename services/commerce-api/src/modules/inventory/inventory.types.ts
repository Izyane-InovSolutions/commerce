import type { InventoryRecord } from '@prisma/client';

export type InventoryRecordView = InventoryRecord & { available: number };

export type ReserveOptions = {
  warehouseId?: string;
  holderType?: string;
  holderId?: string;
  ttlSeconds?: number;
};
