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
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import {
  GUEST_TOKEN_HEADER,
  GuestToken,
} from '../../common/auth/guest-token.decorator';
import { OptionalAuth } from '../../common/auth/optional-auth.decorator';
import { OptionalCurrentUser } from '../../common/auth/optional-current-user.decorator';
import { CurrencyQueryDto } from '../../common/catalog/dto/currency-query.dto';
import { AddItemDto } from './dto/add-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { CartService } from './cart.service';
import { AddItemResponse, CartIdentity, CartView } from './cart.types';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @OptionalAuth()
  @Get()
  getCart(
    @OptionalCurrentUser() user: AuthenticatedUser | undefined,
    @Query() query: CurrencyQueryDto,
    @GuestToken() guestToken?: string,
  ): Promise<CartView> {
    return this.cartService.getCartView(
      this.identity(user, guestToken),
      query.currency,
    );
  }

  @OptionalAuth()
  @Post('items')
  async addItem(
    @OptionalCurrentUser() user: AuthenticatedUser | undefined,
    @GuestToken() guestToken: string | undefined,
    @Body() dto: AddItemDto,
    @Query() query: CurrencyQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AddItemResponse> {
    const result = await this.cartService.addItem(
      this.identity(user, guestToken),
      dto.offerId,
      dto.quantity,
      query.currency,
    );

    if (result.guestToken) {
      response.setHeader(GUEST_TOKEN_HEADER, result.guestToken);
    }

    return { ...result.view, guestToken: result.guestToken };
  }

  @OptionalAuth()
  @Patch('items/:itemId')
  updateItem(
    @OptionalCurrentUser() user: AuthenticatedUser | undefined,
    @GuestToken() guestToken: string | undefined,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateItemDto,
    @Query() query: CurrencyQueryDto,
  ): Promise<CartView> {
    return this.cartService.updateItemQuantity(
      this.identity(user, guestToken),
      itemId,
      dto.quantity,
      query.currency,
    );
  }

  @OptionalAuth()
  @Delete('items/:itemId')
  removeItem(
    @OptionalCurrentUser() user: AuthenticatedUser | undefined,
    @GuestToken() guestToken: string | undefined,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Query() query: CurrencyQueryDto,
  ): Promise<CartView> {
    return this.cartService.removeItem(
      this.identity(user, guestToken),
      itemId,
      query.currency,
    );
  }

  // Not @OptionalAuth() — merging requires a real, authenticated user.
  @Post('merge')
  @HttpCode(HttpStatus.OK)
  merge(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CurrencyQueryDto,
    @GuestToken() guestToken?: string,
  ): Promise<CartView> {
    return this.cartService.mergeGuestCart(user.id, guestToken, query.currency);
  }

  private identity(
    user: AuthenticatedUser | undefined,
    guestToken: string | undefined,
  ): CartIdentity {
    return user ? { userId: user.id } : { guestToken };
  }
}
