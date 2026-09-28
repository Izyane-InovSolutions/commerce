export type OutboundEmail = {
  messageId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export interface EmailSender {
  send(message: OutboundEmail): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
