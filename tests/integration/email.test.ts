import { describe, it, expect, vi } from 'vitest';
import { EmailService, createEmailServiceFromEnv, renderActionEmail, renderEmailHtml } from '../../src/services/email.js';

describe('EmailService', () => {
  it('sends via the configured transport with from/to/subject/body', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const svc = new EmailService({ from: 'Mob <no-reply@test.dev>', transport: { sendMail } as any });

    expect(svc.enabled).toBe(true);
    const result = await svc.sendMail({ to: 'user@test.dev', subject: 'Hi', text: 'Hello there' });

    expect(result.sent).toBe(true);
    expect(sendMail).toHaveBeenCalledOnce();
    const arg = sendMail.mock.calls[0][0];
    expect(arg.from).toBe('Mob <no-reply@test.dev>');
    expect(arg.to).toBe('user@test.dev');
    expect(arg.subject).toBe('Hi');
    expect(arg.text).toBe('Hello there');
    // A default HTML body is derived when none is supplied.
    expect(arg.html).toContain('Hello there');
  });

  it('no-ops safely (no throw) when SMTP is not configured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const svc = new EmailService({ from: 'Mob <no-reply@test.dev>', transport: null });

    expect(svc.enabled).toBe(false);
    const result = await svc.sendMail({ to: 'user@test.dev', subject: 'Hi', text: 'Hello' });

    expect(result.sent).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('createEmailServiceFromEnv is disabled without SMTP_HOST', () => {
    const svc = createEmailServiceFromEnv({} as NodeJS.ProcessEnv);
    expect(svc.enabled).toBe(false);
  });

  it('createEmailServiceFromEnv builds a transport when SMTP_HOST is set', () => {
    const svc = createEmailServiceFromEnv({
      SMTP_HOST: 'smtp.test.dev', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASS: 'p',
      MAIL_FROM: 'Mob <no-reply@test.dev>',
    } as unknown as NodeJS.ProcessEnv);
    expect(svc.enabled).toBe(true);
  });

  it('renders an action email with the CTA url in text and html', () => {
    const { text, html } = renderActionEmail({
      title: 'Reset your password', intro: 'Click below', buttonLabel: 'Reset', url: 'https://x.test/reset?token=abc',
    });
    expect(text).toContain('https://x.test/reset?token=abc');
    expect(html).toContain('https://x.test/reset?token=abc');
    expect(html).toContain('Reset');
  });

  it('escapes HTML in the template body', () => {
    const html = renderEmailHtml('T', '<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
