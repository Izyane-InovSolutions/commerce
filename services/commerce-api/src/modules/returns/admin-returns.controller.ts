import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Role, type RefundCase } from '@prisma/client';
import { isUUID } from 'class-validator';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AdminCreateReturnDto } from './dto/admin-create-return.dto';
import { ApproveReturnDto } from './dto/approve-return.dto';
import { FinalizeInspectionDto } from './dto/finalize-inspection.dto';
import { ListReturnsDto } from './dto/list-returns.dto';
import { PostInspectionDto } from './dto/post-inspection.dto';
import { PostReceiptDto } from './dto/post-receipt.dto';
import { RejectReturnDto } from './dto/reject-return.dto';
import { ReturnsService } from './returns.service';
import { ReturnPage, ReturnRequestWithDetail } from './returns.types';

function requireIdempotencyKey(key: string | undefined): string {
  if (!key || !isUUID(key, '4')) {
    throw new BadRequestException('Idempotency-Key header must be a UUID v4');
  }
  return key;
}

/** Staff/admin reads and receipt/inspection posting are allowed by default;
 * routes restricted to admin only (create-on-behalf-of, approve/reject,
 * finalize, refund-case retry) override with their own `@Roles`. */
@Roles(Role.STAFF, Role.ADMIN)
@Controller('admin/returns')
export class AdminReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Roles(Role.ADMIN)
  @Post()
  create(
    @Body() dto: AdminCreateReturnDto,
    @Headers('idempotency-key') key: string,
  ): Promise<ReturnRequestWithDetail> {
    return this.returnsService.requestReturn(
      dto.orderId,
      dto.items,
      requireIdempotencyKey(key),
      dto.userId,
    );
  }

  @Get()
  findAll(@Query() query: ListReturnsDto): Promise<ReturnPage> {
    return this.returnsService.listAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ReturnRequestWithDetail> {
    return this.returnsService.findAny(id);
  }

  @Roles(Role.ADMIN)
  @Post(':id/approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveReturnDto,
  ): Promise<ReturnRequestWithDetail> {
    return this.returnsService.approve(id, dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Post(':id/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectReturnDto,
  ): Promise<ReturnRequestWithDetail> {
    return this.returnsService.reject(id, dto, user.id);
  }

  @Post(':id/receipts')
  postReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PostReceiptDto,
    @Headers('idempotency-key') key: string,
  ): Promise<ReturnRequestWithDetail> {
    return this.returnsService.postReceipt(
      id,
      dto,
      user.id,
      user.role,
      requireIdempotencyKey(key),
    );
  }

  @Post(':id/inspections')
  postInspection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PostInspectionDto,
    @Headers('idempotency-key') key: string,
  ): Promise<ReturnRequestWithDetail> {
    return this.returnsService.postInspection(
      id,
      dto,
      user.id,
      user.role,
      requireIdempotencyKey(key),
    );
  }

  /** Alternative to `isFinal` on `postInspection` — see returns.service.ts. */
  @Roles(Role.ADMIN)
  @Post(':id/finalize-inspection')
  finalizeInspection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FinalizeInspectionDto,
  ): Promise<ReturnRequestWithDetail> {
    return this.returnsService.finalizeInspection(
      id,
      user.id,
      dto.shippingRefunds ?? [],
    );
  }

  @Roles(Role.ADMIN)
  @Post(':id/refund-cases/:refundCaseId/retry')
  retryRefundCase(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('refundCaseId', ParseUUIDPipe) refundCaseId: string,
  ): Promise<RefundCase> {
    return this.returnsService.retryRefundCase(id, refundCaseId);
  }
}
