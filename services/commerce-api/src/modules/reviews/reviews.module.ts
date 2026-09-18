import { Module } from '@nestjs/common';

import { CustomerReviewsController } from './customer-reviews.controller';
import { RatingAggregateService } from './rating-aggregate.service';
import { ReviewEligibilityService } from './review-eligibility.service';
import { ReviewsService } from './reviews.service';

@Module({
  controllers: [CustomerReviewsController],
  providers: [ReviewsService, ReviewEligibilityService, RatingAggregateService],
  // RatingAggregateService's frozen contract (recalculateProductSummary /
  // recalculateSellerSummary) is imported by the admin-moderation module.
  exports: [RatingAggregateService],
})
export class ReviewsModule {}
