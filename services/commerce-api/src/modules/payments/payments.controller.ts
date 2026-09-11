import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '../../common/auth/public.decorator';
import { PaymentsService } from './payments.service';

const WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // The header name/format are placeholders - the in-house gateway's actual
  // webhook contract isn't defined yet (same "awaiting the external provider
  // API" spirit as PendingPaymentProvider).
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers(WEBHOOK_SIGNATURE_HEADER) signature?: string,
  ): Promise<void> {
    if (!request.rawBody || !signature) {
      throw new BadRequestException('Missing webhook signature or body');
    }

    await this.paymentsService.handleWebhook(request.rawBody, signature);
  }
}
