import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, type Refund } from '@prisma/client';
import { isUUID } from 'class-validator';

import { Roles } from '../../common/auth/roles.decorator';
import { RefundPaymentDto } from './dto/gateway-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Admin refunds')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/seller-orders')
export class AdminRefundsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':sellerOrderId/refund')
  refund(
    @Param('sellerOrderId', ParseUUIDPipe) sellerOrderId: string,
    @Body() dto: RefundPaymentDto,
    @Headers('idempotency-key') key: string,
  ): Promise<Refund> {
    if (!isUUID(key ?? '', '4')) {
      throw new BadRequestException('Idempotency-Key must be a UUID v4');
    }

    return this.paymentsService.refundSellerOrder(
      sellerOrderId,
      dto.amount,
      dto.reason,
      key,
    );
  }
}
