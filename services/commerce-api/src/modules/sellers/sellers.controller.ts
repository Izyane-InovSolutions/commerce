import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SellerApplicationDto } from './dto/seller-application.dto';
import { SellersService } from './sellers.service';
import type { SellerDetail } from './sellers.service';

@ApiTags('Sellers')
@ApiBearerAuth()
@Controller('sellers')
export class SellersController {
  constructor(private readonly sellers: SellersService) {}

  @Post('applications')
  apply(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SellerApplicationDto,
  ): Promise<SellerDetail> {
    return this.sellers.apply(user.id, dto);
  }

  @Get('me')
  mine(@CurrentUser() user: AuthenticatedUser): Promise<SellerDetail> {
    return this.sellers.mine(user.id);
  }

  @Post('me/resubmit')
  resubmit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SellerApplicationDto,
  ): Promise<SellerDetail> {
    return this.sellers.resubmit(user.id, dto);
  }
}
