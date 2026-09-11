import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, SellerStatus } from '@prisma/client';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Roles } from '../../common/auth/roles.decorator';
import type { SignedMediaUrl } from '../media/media.service';
import { ReviewSellerDto } from './dto/review-seller.dto';
import { SellerQueryDto } from './dto/seller-query.dto';
import { SellersService } from './sellers.service';
import type { SellerDetail, SellerSummary } from './sellers.service';

@ApiTags('Admin sellers')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/sellers')
export class AdminSellersController {
  constructor(private readonly sellers: SellersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SellerQueryDto,
  ): Promise<{
    items: SellerSummary[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.sellers.list(user.id, query);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SellerDetail> {
    return this.sellers.detail(user.id, id);
  }

  @Get(':id/documents/:documentId/url')
  documentUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<SignedMediaUrl> {
    return this.sellers.documentUrl(user.id, id, documentId);
  }

  @Post(':id/approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewSellerDto,
  ): Promise<SellerDetail> {
    return this.sellers.review(user.id, id, SellerStatus.APPROVED, dto);
  }

  @Post(':id/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewSellerDto,
  ): Promise<SellerDetail> {
    return this.sellers.review(user.id, id, SellerStatus.REJECTED, dto);
  }

  @Post(':id/suspend')
  suspend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewSellerDto,
  ): Promise<SellerDetail> {
    return this.sellers.review(user.id, id, SellerStatus.SUSPENDED, dto);
  }
}
