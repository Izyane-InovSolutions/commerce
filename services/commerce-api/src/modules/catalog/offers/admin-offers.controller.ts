import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../../../common/auth/roles.decorator';
import { UpdateStatusDto } from '../common/dto/update-status.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { CreatePriceDto } from './dto/create-price.dto';
import { OffersService, OfferWithPrices } from './offers.service';

@Roles(Role.STAFF, Role.ADMIN)
@Controller('admin/catalog/offers')
export class AdminOffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<OfferWithPrices> {
    return this.offersService.findByIdAdmin(id);
  }

  @Post()
  create(@Body() dto: CreateOfferDto): Promise<OfferWithPrices> {
    return this.offersService.create(dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ): Promise<OfferWithPrices> {
    return this.offersService.updateStatus(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.offersService.remove(id);
  }

  @Post(':id/prices')
  addPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePriceDto,
  ): Promise<OfferWithPrices> {
    return this.offersService.addPrice(id, dto);
  }
}
