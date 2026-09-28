import { ConfigService } from '@nestjs/config';

import { MailerService } from './mailer.service';

function config(values: Record<string, string>): ConfigService {
  return {
    get: (key: string, fallback?: unknown): unknown => values[key] ?? fallback,
  } as unknown as ConfigService;
}

describe('MailerService', () => {
  it('uses SMTP when SMTP_URL is set', () => {
    const mailer = new MailerService(
      config({ NODE_ENV: 'production', SMTP_URL: 'smtp://mail.example.com' }),
    );

    expect(mailer.kind).toBe('smtp');
  });

  it('uses SMTP when only SMTP_HOST is set', () => {
    const mailer = new MailerService(config({ SMTP_HOST: 'mail.example.com' }));

    expect(mailer.kind).toBe('smtp');
  });

  it('logs instead of sending outside production when unconfigured', async () => {
    const mailer = new MailerService(config({ NODE_ENV: 'development' }));

    expect(mailer.kind).toBe('log');
    await expect(
      mailer.send({ to: 'a@example.com', subject: 'Hi', text: 'Body' }),
    ).resolves.toEqual({ messageId: null });
  });

  it('refuses to send in production when unconfigured, so the failure is recorded', async () => {
    const mailer = new MailerService(config({ NODE_ENV: 'production' }));

    expect(mailer.kind).toBe('disabled');
    await expect(
      mailer.send({ to: 'a@example.com', subject: 'Hi', text: 'Body' }),
    ).rejects.toThrow(/No email transport/);
  });
});
