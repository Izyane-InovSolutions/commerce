export type EmailTemplate =
  | 'password-reset'
  | 'password-changed'
  | 'email-verification';

type RenderedEmail = { subject: string; text: string; html: string };

export function renderEmail(
  template: string,
  variables: Record<string, unknown>,
): RenderedEmail {
  if (template === 'password-reset') {
    const resetUrl = variables.resetUrl;
    if (typeof resetUrl !== 'string') {
      throw new Error('INVALID_EMAIL_TEMPLATE_DATA');
    }
    const safeUrl = escapeHtml(resetUrl);
    return {
      subject: 'Reset your Commerce password',
      text: `Use this link to reset your password. It expires in one hour:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use the link below to reset your Commerce password. It expires in one hour.</p><p><a href="${safeUrl}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    };
  }

  if (template === 'password-changed') {
    return {
      subject: 'Your Commerce password was changed',
      text: 'Your Commerce password was changed. If this was not you, contact support immediately.',
      html: '<p>Your Commerce password was changed.</p><p>If this was not you, contact support immediately.</p>',
    };
  }

  if (template === 'email-verification') {
    const verificationUrl = variables.verificationUrl;
    if (typeof verificationUrl !== 'string') {
      throw new Error('INVALID_EMAIL_TEMPLATE_DATA');
    }
    const safeUrl = escapeHtml(verificationUrl);
    return {
      subject: 'Verify your Commerce email address',
      text: `Use this link to verify your email address. It expires in 24 hours:\n\n${verificationUrl}\n\nIf you did not create this account, you can ignore this email.`,
      html: `<p>Use the link below to verify your Commerce email address. It expires in 24 hours.</p><p><a href="${safeUrl}">Verify email address</a></p><p>If you did not create this account, you can ignore this email.</p>`,
    };
  }

  throw new Error('UNKNOWN_EMAIL_TEMPLATE');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
