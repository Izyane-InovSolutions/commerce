import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createTransport,
  type SMTPTransportOptions,
  type Transporter,
} from 'nodemailer';

export const DEFAULT_MAIL_FROM = 'Commerce <no-reply@localhost>';

// Well under nodemailer's defaults (2 min to connect, 10 min idle): a hung
// SMTP server must fail the attempt — to be retried by the delivery sweep —
// rather than stall the sweep and every delivery queued behind it.
const SMTP_TIMEOUT_MS = 15_000;

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

/**
 * - `smtp`: SMTP_URL or SMTP_HOST is set; mail is really sent.
 * - `log`: nothing configured outside production; the message, links and
 *   all, is written to the log so a developer can follow it (a password
 *   reset link included — that is the point in development).
 * - `disabled`: nothing configured in production. Sending throws, so the
 *   delivery is recorded FAILED with a reason instead of silently dropped,
 *   and nothing — least of all a reset token — reaches the log.
 */
export type MailTransportKind = 'smtp' | 'log' | 'disabled';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  readonly kind: MailTransportKind;

  constructor(config: ConfigService) {
    this.from = config.get<string>('MAIL_FROM') || DEFAULT_MAIL_FROM;
    const smtp = smtpOptions(config);
    if (smtp) {
      this.transporter = createTransport(smtp);
      this.kind = 'smtp';
    } else {
      this.transporter = null;
      this.kind =
        config.get<string>('NODE_ENV') === 'production' ? 'disabled' : 'log';
      if (this.kind === 'disabled')
        this.logger.warn(
          'No SMTP transport configured (SMTP_URL or SMTP_HOST): emails will not be sent',
        );
    }
  }

  async send(message: MailMessage): Promise<{ messageId: string | null }> {
    if (this.transporter) {
      const info = await this.transporter.sendMail({
        from: this.from,
        ...message,
      });
      return { messageId: info.messageId ?? null };
    }
    if (this.kind === 'log') {
      this.logger.log(
        `Email not sent (no SMTP configured) to ${message.to}: ${message.subject}\n${message.text}`,
      );
      return { messageId: null };
    }
    throw new Error(
      'No email transport is configured (set SMTP_URL or SMTP_HOST)',
    );
  }
}

/** SMTP_URL wins when both it and SMTP_HOST are set. */
function smtpOptions(config: ConfigService): SMTPTransportOptions | null {
  const timeouts = {
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  };
  const url = config.get<string>('SMTP_URL');
  if (url) return { url, ...timeouts };

  const host = config.get<string>('SMTP_HOST');
  if (!host) return null;
  const secure = String(config.get('SMTP_SECURE', 'false')) === 'true';
  const user = config.get<string>('SMTP_USER');
  return {
    host,
    port: Number(config.get('SMTP_PORT') || (secure ? 465 : 587)),
    secure,
    auth: user
      ? { user, pass: config.get<string>('SMTP_PASS') ?? '' }
      : undefined,
    ...timeouts,
  };
}
