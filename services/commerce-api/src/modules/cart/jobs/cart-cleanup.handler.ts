import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { JobHandler } from '../../../infrastructure/jobs/job-handler.interface';
import { CartService } from '../cart.service';

export const CART_CLEANUP_JOB_TYPE = 'cart.cleanup_items';

export type CartCleanupPayload = {
  userId: string;
  /** The checkout whose cart receipt names the lines to remove. */
  orderId?: string;
  /**
   * Legacy payloads only (no orderId): named lines, or the whole cart when
   * absent. They carry no line revisions, so they are never executed.
   */
  itemIds?: string[];
};

/**
 * Removes the cart lines a checkout consumed once its payment is known to
 * have been submitted, retrying while that is still unknown. Enqueued with
 * the order itself, so the cart catches up even if the inline cleanup after
 * checkout never ran.
 */
@Injectable()
export class CartCleanupHandler implements JobHandler {
  readonly type = CART_CLEANUP_JOB_TYPE;

  private readonly logger = new Logger(CartCleanupHandler.name);

  constructor(private readonly cartService: CartService) {}

  async handle(payload: Prisma.JsonValue): Promise<void> {
    const { userId, orderId } = this.parsePayload(payload);

    if (!orderId) {
      // Jobs from before checkout receipts existed cannot tell the lines they
      // were meant for from ones added or changed since, so they complete
      // without deleting anything rather than risk emptying a live cart.
      this.logger.warn('Skipping legacy cart cleanup job without an orderId');
      return;
    }

    await this.cartService.cleanUpCheckout(userId, orderId);
  }

  private parsePayload(payload: Prisma.JsonValue): CartCleanupPayload {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      typeof (payload as { userId?: unknown }).userId !== 'string'
    ) {
      throw new Error(
        'Malformed cart.cleanup_items payload: expected { userId: string, orderId?: string }',
      );
    }

    const { userId, itemIds, orderId } = payload as {
      userId: string;
      itemIds?: unknown;
      orderId?: unknown;
    };

    if (orderId !== undefined && typeof orderId !== 'string') {
      throw new Error(
        'Malformed cart.cleanup_items payload: orderId must be a string',
      );
    }

    if (
      itemIds !== undefined &&
      (!Array.isArray(itemIds) ||
        !itemIds.every((id) => typeof id === 'string'))
    ) {
      throw new Error(
        'Malformed cart.cleanup_items payload: itemIds must be a string array',
      );
    }

    return { userId, orderId, itemIds };
  }
}
