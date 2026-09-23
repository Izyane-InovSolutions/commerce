import { Module } from '@nestjs/common';

import { SavedSellersController } from './saved-sellers.controller';
import { SavedSellersService } from './saved-sellers.service';

@Module({
  controllers: [SavedSellersController],
  providers: [SavedSellersService],
  exports: [SavedSellersService],
})
export class SavedSellersModule {}
