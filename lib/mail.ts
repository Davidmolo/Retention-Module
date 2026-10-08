/**
 * App outbound email (invites, account mail).
 * Uses SMTP_* — does NOT apply Retention TEST redirect so invitees get real mail.
 */
import nodemailer from 'nodemailer';

function env(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

export type AppEmailResult = {
  ok: boolean;
  mocked: boolean;
  messageId?: string | null;
  error?: string;
};

export function isAppSmtpConfigured(): boolean {
  return Boolean(env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS'));
}

function fromAddress(): string {
  return env('SMTP_FROM', 'notifications@goxxii.com');
}

function fromName(): string {
  return env('SMTP_FROM_NAME', 'XXII Century Notifications');
}

function uniqueEmails(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const email = String(raw || '')
      .trim()
      .toLowerCase();
    if (!email.includes('@') || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export async function sendAppEmail(opts: {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): Promise<AppEmailResult> {
  const to = uniqueEmails(
    Array.isArray(opts.to) ? opts.to : [opts.to]
  );
  const cc = uniqueEmails(
    Array.isArray(opts.cc) ? opts.cc : opts.cc ? [opts.cc] : []
  ).filter((e) => !to.includes(e));

  if (!to.length) {
    return { ok: false, mocked: false, error: 'Invalid recipient email' };
  }

  if (!isAppSmtpConfigured()) {
    console.log('[app-email:mock]', {
      to,
      cc,
      subject: opts.subject,
      preview: opts.text.slice(0, 300),
    });
    return {
      ok: true,
      mocked: true,
      messageId: `mock-app-email-${Date.now()}`,
    };
  }

  try {
    const port = Number(env('SMTP_PORT', '587')) || 587;
    const secure =
      env('SMTP_SECURE', port === 465 ? 'true' : 'false').toLowerCase() ===
      'true';
    const transporter = nodemailer.createTransport({
      host: env('SMTP_HOST'),
      port,
      secure,
      requireTLS: !secure && port === 587,
      auth: {
        user: env('SMTP_USER'),
        pass: env('SMTP_PASS'),
      },
    });

    const info = await transporter.sendMail({
      from: `"${fromName()}" <${fromAddress()}>`,
      to: to.join(', '),
      cc: cc.length ? cc.join(', ') : undefined,
      replyTo: opts.replyTo || undefined,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });

    console.log('[app-email:sent]', {
      to,
      cc,
      subject: opts.subject,
      messageId: info.messageId,
    });
    return {
      ok: true,
      mocked: false,
      messageId: info.messageId || null,
    };
  } catch (e) {
    console.error('[app-email:error]', (e as Error).message);
    return {
      ok: false,
      mocked: false,
      error: (e as Error).message || 'Failed to send email',
    };
  }
}
