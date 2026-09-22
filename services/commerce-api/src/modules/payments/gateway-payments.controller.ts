import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { isUUID } from 'class-validator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Roles } from '../../common/auth/roles.decorator';
import { GatewayPaymentsService } from './gateway-payments.service';
import type { PaymentSnapshot } from './gateway-payments.service';
import type { GatewayPaymentPage } from './unified-payment.provider';
import {
  GatewayPaymentQueryDto,
  PaymentReasonDto,
  RefundPaymentDto,
} from './dto/gateway-payment.dto';

@ApiTags('Gateway payments')
@ApiBearerAuth()
@Controller()
export class GatewayPaymentsController {
  constructor(private readonly payments: GatewayPaymentsService) {}
  @Get('payments/:id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentSnapshot> {
    return this.payments.get(user.id, id);
  }
  @Post('payments/:id/status')
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentSnapshot> {
    return this.payments.status(user.id, id);
  }
  @Post('payments/:id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaymentReasonDto,
  ): Promise<PaymentSnapshot> {
    return this.payments.cancel(user.id, id, dto.reason);
  }
  @Roles(Role.ADMIN)
  @Get('admin/payments')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GatewayPaymentQueryDto,
  ): Promise<GatewayPaymentPage> {
    return this.payments.list(user.id, query);
  }
  @Roles(Role.ADMIN)
  @Post('admin/payments/:id/refund')
  refund(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundPaymentDto,
    @Headers('idempotency-key') key: string,
  ): Promise<PaymentSnapshot> {
    if (!isUUID(key ?? '', '4'))
      throw new BadRequestException('Idempotency-Key must be a UUID v4');
    return this.payments.refund(user.id, id, dto, key);
  }
}
