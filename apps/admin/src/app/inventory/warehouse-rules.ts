import type { BackendInventoryRecord } from '@commerce/contracts';

/**
 * Why a warehouse cannot be deleted from here, or null when it can.
 *
 * The API does not refuse a warehouse that holds stock: deleting it cascades
 * through its stock records and takes their movement history with them, which
 * is the audit trail for every receipt and adjustment. So the portal refuses
 * instead, for any warehouse that has ever had a record — only one created by
 * mistake and never used can go. Anything else should be deactivated.
 */
export function warehouseDeleteBlocker(
  warehouseId: string,
  records: Pick<BackendInventoryRecord, 'warehouseId' | 'onHand'>[],
): string | null {
  const held = records.filter((record) => record.warehouseId === warehouseId);
  if (held.length === 0) {
    return null;
  }

  const units = held.reduce((sum, record) => sum + record.onHand, 0);
  const stock =
    units > 0
      ? `holds ${units} ${units === 1 ? 'unit' : 'units'} across ${held.length} stock ${held.length === 1 ? 'record' : 'records'}`
      : `has ${held.length} stock ${held.length === 1 ? 'record' : 'records'}`;

  return `This warehouse ${stock}. Deleting it would erase their movement history, so deactivate it instead.`;
}
