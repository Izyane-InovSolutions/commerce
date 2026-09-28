export type EmailTemplate = 'password-reset' | 'password-changed';

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
