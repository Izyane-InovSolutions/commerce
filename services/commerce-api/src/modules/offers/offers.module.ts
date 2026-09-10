import { Module } from '@nestjs/common';

import { AdminOffersController } from './admin-offers.controller';
import { OffersService } from './offers.service';

@Module({
  controllers: [AdminOffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
