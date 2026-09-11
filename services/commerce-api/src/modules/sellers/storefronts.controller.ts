import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { StorefrontsService } from './storefronts.service';
import type { PublicStorefront } from './storefronts.service';
import { UpdateStorefrontDto } from './dto/update-storefront.dto';

@ApiTags('Storefronts')
@Controller()
export class StorefrontsController {
  constructor(private readonly storefronts: StorefrontsService) {}

  @Public()
  @Get('storefronts/:slug')
  find(@Param('slug') slug: string): Promise<PublicStorefront> {
    return this.storefronts.findPublic(slug);
  }

  @ApiBearerAuth()
  @Put('sellers/me/storefront')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateStorefrontDto,
  ): Promise<PublicStorefront & { version: number }> {
    return this.storefronts.update(user.id, dto);
  }
}
