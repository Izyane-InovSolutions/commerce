import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Role, SupplierProduct } from '@prisma/client';

import { Roles } from '../../../common/auth/roles.decorator';
import { CreateSupplierProductDto } from './dto/create-supplier-product.dto';
import { UpdateSupplierProductDto } from './dto/update-supplier-product.dto';
import { SupplierProductsService } from './supplier-products.service';

@Roles(Role.STAFF, Role.ADMIN)
@Controller('admin/procurement/suppliers/:supplierId/products')
export class SupplierProductsController {
  constructor(
    private readonly supplierProductsService: SupplierProductsService,
  ) {}

  @Get()
  findAll(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
  ): Promise<SupplierProduct[]> {
    return this.supplierProductsService.listForSupplier(supplierId);
  }

  @Post()
  create(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: CreateSupplierProductDto,
  ): Promise<SupplierProduct> {
    return this.supplierProductsService.create(supplierId, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierProductDto,
  ): Promise<SupplierProduct> {
    return this.supplierProductsService.update(id, dto);
  }
}
