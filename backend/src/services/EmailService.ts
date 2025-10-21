import nodemailer from 'nodemailer';
import { incrementEmailSend } from '../metrics.js';

export interface EmailProvider {
  sendInvite(to: string, subject: string, text: string, html?: string): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
  async sendInvite(to: string, subject: string, text: string, html?: string) {
    console.log('[EMAIL:CONSOLE]', {
      to,
      subject,
      text,
      htmlSnippet: html?.slice(0, 120)
    });
  }
}

class SmtpEmailProvider implements EmailProvider {
  private transporter;
  private from: string;

  constructor(cfg: { host: string; port: number; user?: string; pass?: string; from: string }) {
    this.transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: false,
      auth: cfg.user
        ? {
            user: cfg.user,
            pass: cfg.pass
          }
        : undefined
    } as any);
    this.from = cfg.from;
  }

  async sendInvite(to: string, subject: string, text: string, html?: string) {
    await this.transporter.sendMail({ from: this.from, to, subject, text, html });
  }
}

function withMetrics(provider: EmailProvider): EmailProvider {
  return {
    async sendInvite(to: string, subject: string, text: string, html?: string) {
      try {
        await provider.sendInvite(to, subject, text, html);
        incrementEmailSend('success');
      } catch (err) {
        incrementEmailSend('failed');
        throw err;
      }
    }
  };
}

export function getEmailProvider() {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM || 'SkolApp <no-reply@skolapp.local>';
  if (host) {
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER || undefined;
    const pass = process.env.SMTP_PASS || undefined;
    return withMetrics(new SmtpEmailProvider({ host, port, user, pass, from }));
  }
  return withMetrics(new ConsoleEmailProvider());
}
