import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

import { smtpPort } from '../config/env.validation';
import type { EmailSender, OutboundEmail } from './email-sender.interface';

@Injectable()
export class SmtpEmailSender implements EmailSender {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const user = config.get<string>('SMTP_USER', '');
    const pass = config.get<string>('SMTP_PASS', '');
    this.from = config.getOrThrow<string>('EMAIL_FROM');
    const secure = config.get<string>('SMTP_SECURE', 'false') === 'true';
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port: smtpPort(config.get('SMTP_PORT'), secure),
      secure,
      ...(user && pass ? { auth: { user, pass } } : {}),
      connectionTimeout: config.get<number>(
        'SMTP_CONNECTION_TIMEOUT_MS',
        10_000,
      ),
      greetingTimeout: config.get<number>('SMTP_CONNECTION_TIMEOUT_MS', 10_000),
      socketTimeout: config.get<number>('SMTP_SEND_TIMEOUT_MS', 30_000),
    });
  }

  async send(message: OutboundEmail): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      messageId: message.messageId,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
