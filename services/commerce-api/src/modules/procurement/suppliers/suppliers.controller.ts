import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role, Supplier, SupplierStatus } from '@prisma/client';

import type { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { DeactivateSupplierDto } from './dto/deactivate-supplier.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierPage, SuppliersService } from './suppliers.service';

@Roles(Role.STAFF, Role.ADMIN)
@Controller('admin/procurement/suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  findAll(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: SupplierStatus,
  ): Promise<SupplierPage> {
    return this.suppliersService.findAll({ ...query, status });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Supplier> {
    return this.suppliersService.findById(id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSupplierDto,
  ): Promise<Supplier> {
    return this.suppliersService.create(dto, user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ): Promise<Supplier> {
    return this.suppliersService.update(id, dto, user.id);
  }

  @Post(':id/deactivate')
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeactivateSupplierDto,
  ): Promise<Supplier> {
    return this.suppliersService.deactivate(id, dto.version, user.id);
  }
}
