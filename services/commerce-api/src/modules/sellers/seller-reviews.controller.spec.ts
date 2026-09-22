import { ForbiddenException } from '@nestjs/common';

import { SellerReviewsController } from './seller-reviews.controller';
import { SellerReviewsService } from './seller-reviews.service';
import { SellersService } from './sellers.service';

describe('SellerReviewsController', () => {
  it('scopes reviews to the requesting seller once approval is confirmed', async () => {
    const sellersService = {
      requireApproved: jest.fn().mockResolvedValue({ id: 'seller-1' }),
    };
    const sellerReviews = {
      listReviews: jest.fn().mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 20, total: 0 },
      }),
      listRatings: jest.fn(),
    };
    const controller = new SellerReviewsController(
      sellersService as unknown as SellersService,
      sellerReviews as unknown as SellerReviewsService,
    );

    await controller.reviews({ id: 'user-1' } as never, {
      page: 1,
      limit: 20,
    });

    expect(sellersService.requireApproved).toHaveBeenCalledWith('user-1');
    expect(sellerReviews.listReviews).toHaveBeenCalledWith('seller-1', {
      page: 1,
      limit: 20,
    });
  });

  // Cross-seller isolation: a user with no approved seller (or someone
  // else's) never reaches SellerReviewsService — requireApproved rejects
  // first, the same gate SellerFinancialsController uses.
  it('never lists another seller\'s data — requireApproved rejects first', async () => {
    const sellersService = {
      requireApproved: jest
        .fn()
        .mockRejectedValue(new ForbiddenException('Seller approval is required')),
    };
    const sellerReviews = {
      listReviews: jest.fn(),
      listRatings: jest.fn(),
    };
    const controller = new SellerReviewsController(
      sellersService as unknown as SellersService,
      sellerReviews as unknown as SellerReviewsService,
    );

    await expect(
      controller.reviews({ id: 'user-1' } as never, { page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sellerReviews.listReviews).not.toHaveBeenCalled();
  });
});
