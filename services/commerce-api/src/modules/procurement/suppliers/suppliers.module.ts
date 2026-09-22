import { Module } from '@nestjs/common';

import { AuditModule } from '../../audit/audit.module';
import { SupplierProductsController } from './supplier-products.controller';
import { SupplierProductsService } from './supplier-products.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [AuditModule],
  controllers: [SuppliersController, SupplierProductsController],
  providers: [SuppliersService, SupplierProductsService],
  exports: [SuppliersService, SupplierProductsService],
})
export class SuppliersModule {}
