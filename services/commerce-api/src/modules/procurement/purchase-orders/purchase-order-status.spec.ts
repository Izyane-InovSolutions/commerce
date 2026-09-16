import { ConflictException } from '@nestjs/common';
import { PurchaseOrderStatus } from '@prisma/client';

import { assertPurchaseOrderTransition } from './purchase-order-status';

describe('assertPurchaseOrderTransition', () => {
  it.each([
    [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.SUBMITTED],
    [PurchaseOrderStatus.SUBMITTED, PurchaseOrderStatus.APPROVED],
    [PurchaseOrderStatus.SUBMITTED, PurchaseOrderStatus.REJECTED],
    [PurchaseOrderStatus.SUBMITTED, PurchaseOrderStatus.DRAFT],
    [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.ORDERED],
    [PurchaseOrderStatus.ORDERED, PurchaseOrderStatus.PARTIALLY_RECEIVED],
    [PurchaseOrderStatus.ORDERED, PurchaseOrderStatus.CANCELLED],
    [PurchaseOrderStatus.PARTIALLY_RECEIVED, PurchaseOrderStatus.RECEIVED],
    [PurchaseOrderStatus.PARTIALLY_RECEIVED, PurchaseOrderStatus.CLOSED_SHORT],
  ])('allows %s -> %s', (from, to) => {
    expect(() => assertPurchaseOrderTransition(from, to)).not.toThrow();
  });

  it.each([
    [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.APPROVED],
    [PurchaseOrderStatus.REJECTED, PurchaseOrderStatus.SUBMITTED],
    [PurchaseOrderStatus.RECEIVED, PurchaseOrderStatus.ORDERED],
    [PurchaseOrderStatus.CANCELLED, PurchaseOrderStatus.DRAFT],
    [PurchaseOrderStatus.CLOSED_SHORT, PurchaseOrderStatus.RECEIVED],
    [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.RECEIVED],
  ])('rejects %s -> %s', (from, to) => {
    expect(() => assertPurchaseOrderTransition(from, to)).toThrow(
      ConflictException,
    );
  });
});
