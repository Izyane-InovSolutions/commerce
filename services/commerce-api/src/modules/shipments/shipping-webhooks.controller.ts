import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '../../common/auth/public.decorator';
import { ShipmentsService } from './shipments.service';

/**
 * Generic carrier webhook intake, keyed by providerCode. Reads the raw body
 * (like PaymentsController.webhook) rather than an `@Body()` DTO — the
 * payload shape is entirely carrier-defined, so there is no fixed contract
 * to reflect into OpenAPI, and future signed-webhook carriers (#50) will
 * need the exact bytes to verify a signature anyway. The MANUAL carrier
 * never calls this (it has no `parseWebhook`).
 */
@Public()
@Controller('webhooks/shipping')
export class ShippingWebhooksController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post(':providerCode')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Param('providerCode') providerCode: string,
    @Req() request: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string>,
  ): Promise<void> {
    if (!request.rawBody) {
      throw new BadRequestException('Missing webhook body');
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(request.rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Webhook body must be valid JSON');
    }

    await this.shipmentsService.ingestWebhook(providerCode, payload, headers);
  }
}
