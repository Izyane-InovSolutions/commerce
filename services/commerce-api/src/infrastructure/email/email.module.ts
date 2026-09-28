import { Module } from '@nestjs/common';

import { JobsModule } from '../jobs/jobs.module';
import { EmailDeliveriesService } from './email-deliveries.service';
import { EMAIL_SENDER } from './email-sender.interface';
import { EmailSendHandler } from './email-send.handler';
import { SmtpEmailSender } from './smtp-email.sender';

@Module({
  imports: [JobsModule],
  providers: [
    EmailDeliveriesService,
    EmailSendHandler,
    SmtpEmailSender,
    { provide: EMAIL_SENDER, useExisting: SmtpEmailSender },
  ],
  exports: [EmailDeliveriesService, EmailSendHandler],
})
export class EmailModule {}
