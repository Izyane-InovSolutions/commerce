import { ServiceUnavailableException } from '@nestjs/common';

export class PaymentOutcomeUnknownException extends ServiceUnavailableException {
  constructor() {
    super(
      'The gateway result is uncertain; reconcile the existing payment before attempting another charge',
    );
  }
}
