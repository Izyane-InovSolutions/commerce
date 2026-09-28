import { Controller, Get, Query } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RequireVerifiedEmail } from '../../common/auth/require-verified-email.decorator';
import { ListSellerReturnsDto } from './dto/list-seller-returns.dto';
import { SellerReturnsService } from './seller-returns.service';
import { SellerReturnPage } from './seller-returns.types';

@Controller('sellers/me/returns')
@RequireVerifiedEmail()
export class SellerReturnsController {
  constructor(private readonly sellerReturnsService: SellerReturnsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListSellerReturnsDto,
  ): Promise<SellerReturnPage> {
    return this.sellerReturnsService.listOwn(user.id, query);
  }
}
