import { Module } from '@nestjs/common';

import { AuditModule } from '../../audit/audit.module';
import { ReviewsModule } from '../reviews.module';
import { AdminReviewsController } from './admin-reviews.controller';
import { AdminReviewsService } from './admin-reviews.service';

@Module({
  // ReviewsModule exports RatingAggregateService — the frozen contract this
  // module depends on for every visibility-changing moderation action.
  imports: [AuditModule, ReviewsModule],
  controllers: [AdminReviewsController],
  providers: [AdminReviewsService],
})
export class AdminReviewsModule {}
