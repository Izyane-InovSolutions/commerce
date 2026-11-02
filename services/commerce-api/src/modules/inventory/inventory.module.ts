import { Module } from '@nestjs/common';

import { OffersModule } from '../offers/offers.module';
import { SellersModule } from '../sellers/sellers.module';
import { AuditModule } from '../audit/audit.module';
import { AdminInventoryController } from './admin-inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryExpireReservationHandler } from './jobs/inventory-expire-reservation.handler';
import { SellerInventoryController } from './seller-inventory.controller';
import { SellerInventoryService } from './seller-inventory.service';
import { WarehousesModule } from './warehouses/warehouses.module';

@Module({
  imports: [WarehousesModule, OffersModule, SellersModule, AuditModule],
  controllers: [AdminInventoryController, SellerInventoryController],
  providers: [
    InventoryService,
    SellerInventoryService,
    InventoryExpireReservationHandler,
  ],
  exports: [InventoryService, InventoryExpireReservationHandler],
})
export class InventoryModule {}
