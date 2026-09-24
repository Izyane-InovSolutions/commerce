import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { SaveSellerDto } from './dto/save-seller.dto';
import { SavedSellersService } from './saved-sellers.service';
import { SavedSellerView } from './saved-sellers.types';

@Controller('saved-sellers')
export class SavedSellersController {
  constructor(private readonly savedSellers: SavedSellersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<SavedSellerView[]> {
    return this.savedSellers.list(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveSellerDto,
  ): Promise<void> {
    return this.savedSellers.add(user.id, dto.sellerId);
  }

  @Delete(':sellerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sellerId', ParseUUIDPipe) sellerId: string,
  ): Promise<void> {
    return this.savedSellers.remove(user.id, sellerId);
  }
}
