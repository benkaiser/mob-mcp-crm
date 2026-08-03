import nodemailer, { type Transporter } from 'nodemailer';

// ─── Types ──────────────────────────────────────────────────────

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body (required - always provide a text fallback). */
  text: string;
  /** Optional HTML body. When omitted, a simple HTML wrapper around `text` is used. */
  html?: string;
}

export interface EmailServiceOptions {
  /** From address, e.g. `"Mob <no-reply@example.com>"`. */
  from: string;
  /**
   * A nodemailer transport. When null/undefined the service is disabled and
   * `sendMail` becomes a logging no-op (used in dev / self-hosted setups that
   * haven't configured SMTP, and in tests).
   */
  transport?: Transporter | null;
}

export interface SendResult {
  sent: boolean;
}

// ─── Service ────────────────────────────────────────────────────

/**
 * Provider-agnostic transactional email service built on nodemailer/SMTP.
 *
 * Configuration is supplied via the constructor (see `createEmailServiceFromEnv`
 * for the env-driven factory). When no transport is configured the service
 * degrades gracefully: `sendMail` logs a warning and returns `{ sent: false }`
 * rather than throwing, so password-reset / verification flows never crash a
 * server that simply hasn't set up SMTP yet.
 */
export class EmailService {
  private transport: Transporter | null;
  private from: string;

  constructor(opts: EmailServiceOptions) {
    this.from = opts.from;
    this.transport = opts.transport ?? null;
  }

  /** Whether a real transport is configured. */
  get enabled(): boolean {
    return this.transport !== null;
  }

  /** Send an email. No-ops (with a warning) when SMTP is not configured. */
  async sendMail(msg: EmailMessage): Promise<SendResult> {
    if (!this.transport) {
      console.warn(
        `[email] SMTP not configured - skipping email to ${msg.to} ("${msg.subject}"). ` +
        `Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/MAIL_FROM to enable delivery.`,
      );
      return { sent: false };
    }
    await this.transport.sendMail({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html ?? renderEmailHtml(msg.subject, msg.text),
    });
    return { sent: true };
  }
}

// ─── Env factory ────────────────────────────────────────────────

/**
 * Build an EmailService from environment variables:
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE (default false),
 *   SMTP_USER, SMTP_PASS, MAIL_FROM (default "Mob <no-reply@localhost>").
 *
 * When SMTP_HOST is unset the service is created in disabled (no-op) mode.
 */
export function createEmailServiceFromEnv(env: NodeJS.ProcessEnv = process.env): EmailService {
  const from = env.MAIL_FROM || 'Mob <no-reply@localhost>';
  const host = env.SMTP_HOST;

  if (!host) {
    return new EmailService({ from, transport: null });
  }

  const port = parseInt(env.SMTP_PORT || '587', 10);
  const secure = env.SMTP_SECURE === 'true' || port === 465;
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });

  return new EmailService({ from, transport });
}

// ─── Templating ─────────────────────────────────────────────────

/**
 * Wrap a plain-text body in a minimal, dependency-free HTML layout. Keeps
 * transactional emails readable in HTML clients while preserving the text
 * fallback. Line breaks in `text` become paragraphs.
 */
export function renderEmailHtml(title: string, text: string): string {
  const escaped = escapeHtml(text);
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="font-size:20px;margin:0 0 24px;color:#1a1a2e;">${escapeHtml(title)}</h1>
      ${paragraphs}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="font-size:12px;color:#6b7280;margin:0;">Mob - your AI-first personal CRM 🦘</p>
    </div>
  </body>
</html>`;
}

/**
 * Build a call-to-action email (text + HTML) with a prominent button link.
 * Returns `{ text, html }` suitable for spreading into an EmailMessage.
 */
export function renderActionEmail(opts: {
  title: string;
  intro: string;
  buttonLabel: string;
  url: string;
  outro?: string;
}): { text: string; html: string } {
  const text = [
    opts.intro,
    '',
    `${opts.buttonLabel}: ${opts.url}`,
    ...(opts.outro ? ['', opts.outro] : []),
  ].join('\n');

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="font-size:20px;margin:0 0 16px;color:#1a1a2e;">${escapeHtml(opts.title)}</h1>
      <p style="margin:0 0 24px;">${escapeHtml(opts.intro)}</p>
      <p style="margin:0 0 24px;">
        <a href="${escapeAttr(opts.url)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">${escapeHtml(opts.buttonLabel)}</a>
      </p>
      <p style="font-size:13px;color:#6b7280;margin:0 0 8px;">Or paste this link into your browser:</p>
      <p style="font-size:13px;color:#2563eb;word-break:break-all;margin:0 0 24px;">${escapeHtml(opts.url)}</p>
      ${opts.outro ? `<p style="font-size:13px;color:#6b7280;margin:0 0 24px;">${escapeHtml(opts.outro)}</p>` : ''}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;">
      <p style="font-size:12px;color:#6b7280;margin:0;">Mob - your AI-first personal CRM 🦘</p>
    </div>
  </body>
</html>`;

  return { text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
