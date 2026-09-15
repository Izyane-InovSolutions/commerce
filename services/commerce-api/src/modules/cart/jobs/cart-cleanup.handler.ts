import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { JobHandler } from '../../../infrastructure/jobs/job-handler.interface';
import { CartService } from '../cart.service';

export const CART_CLEANUP_JOB_TYPE = 'cart.cleanup_items';

export type CartCleanupPayload = {
  userId: string;
  /** Absent or empty clears the whole cart; otherwise only these lines. */
  itemIds?: string[];
};

/**
 * Retries the cart write that follows a successful checkout charge, when
 * that write failed inline. The charge has already been accepted by the
 * gateway at that point, so this can only be retried, never skipped.
 */
@Injectable()
export class CartCleanupHandler implements JobHandler {
  readonly type = CART_CLEANUP_JOB_TYPE;

  constructor(private readonly cartService: CartService) {}

  async handle(payload: Prisma.JsonValue): Promise<void> {
    const { userId, itemIds } = this.parsePayload(payload);

    if (itemIds && itemIds.length > 0) {
      await this.cartService.removeItems({ userId }, itemIds);
    } else {
      await this.cartService.clearCart({ userId });
    }
  }

  private parsePayload(payload: Prisma.JsonValue): CartCleanupPayload {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      typeof (payload as { userId?: unknown }).userId !== 'string'
    ) {
      throw new Error(
        'Malformed cart.cleanup_items payload: expected { userId: string, itemIds?: string[] }',
      );
    }

    const { userId, itemIds } = payload as {
      userId: string;
      itemIds?: unknown;
    };

    if (
      itemIds !== undefined &&
      (!Array.isArray(itemIds) ||
        !itemIds.every((id) => typeof id === 'string'))
    ) {
      throw new Error(
        'Malformed cart.cleanup_items payload: itemIds must be a string array',
      );
    }

    return { userId, itemIds };
  }
}
