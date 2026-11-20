import nodemailer, { type Transporter, type TransportOptions } from 'nodemailer';
import type { NotificationRecord } from './types.js';

let cachedTransporter: Transporter | null = null;
let cachedSignature = '';

function smtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587) || 587;
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const user = String(process.env.SMTP_USER || '').trim();
  const rawPass = String(process.env.SMTP_PASS || '').trim();
  // Gmail App Passwords are 16 chars often copied with spaces ("abcd efgh ijkl mnop")
  const pass = host.toLowerCase().includes('gmail') ? rawPass.replace(/\s+/g, '') : rawPass;
  const from = String(process.env.SMTP_FROM || '').trim() || (user ? `FCAT ISO Audit System <${user}>` : '');
  const url = String(process.env.SMTP_URL || '').trim();

  return { host, port, secure, user, pass, from, url };
}

function httpMailConfig() {
  return {
    resendApiKey: String(process.env.RESEND_API_KEY || '').trim(),
    brevoApiKey: String(process.env.BREVO_API_KEY || '').trim(),
    googleWebhookUrl: String(process.env.GOOGLE_MAIL_WEBHOOK_URL || '').trim(),
    googleWebhookSecret: String(process.env.GOOGLE_MAIL_WEBHOOK_SECRET || '').trim(),
    from:
      String(process.env.SMTP_FROM || '').trim() ||
      (process.env.SMTP_USER ? `FCAT ISO Audit System <${process.env.SMTP_USER.trim()}>` : ''),
  };
}

export function isEmailConfigured(): boolean {
  const http = httpMailConfig();
  if (http.googleWebhookUrl || http.brevoApiKey || http.resendApiKey) return true;
  const cfg = smtpConfig();
  if (cfg.url) return true;
  return Boolean(cfg.host && cfg.user && cfg.pass);
}

export function getEmailSummary(): { configured: boolean; fromAddress: string; host: string; transport: string } {
  const http = httpMailConfig();
  const cfg = smtpConfig();
  if (http.googleWebhookUrl) {
    return { configured: true, fromAddress: http.from || 'Google Workspace Apps Script', host: 'HTTPS Webhook', transport: 'google-webhook' };
  }
  if (http.brevoApiKey) {
    return { configured: true, fromAddress: http.from, host: 'Brevo HTTPS API', transport: 'brevo' };
  }
  if (http.resendApiKey) {
    return { configured: true, fromAddress: http.from, host: 'Resend HTTPS API', transport: 'resend' };
  }
  return {
    configured: isEmailConfigured(),
    fromAddress: cfg.from || cfg.user || '',
    host: cfg.host || (cfg.url ? 'Custom SMTP URL' : ''),
    transport: isEmailConfigured() ? 'smtp' : 'none',
  };
}

function getTransporter(): Transporter | null {
  const cfg = smtpConfig();
  if (!cfg.url && !(cfg.host && cfg.user && cfg.pass)) return null;

  const signature = JSON.stringify([cfg.url, cfg.host, cfg.port, cfg.secure, cfg.user, cfg.pass]);
  if (cachedTransporter && cachedSignature === signature) {
    return cachedTransporter;
  }

  cachedTransporter = cfg.url
    ? nodemailer.createTransport(cfg.url, {
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      } as TransportOptions)
    : nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: {
          user: cfg.user,
          pass: cfg.pass,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        tls: { minVersion: 'TLSv1.2' },
        // Force IPv4 DNS resolution so cloud containers without IPv6 don't hang
        family: 4,
      } as TransportOptions);
  cachedSignature = signature;
  return cachedTransporter;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseFromField(fromStr: string): { name: string; email: string } {
  const m = fromStr.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) {
    return { name: m[1].trim().replace(/^"|"$/g, '') || 'FCAT ISO Audit System', email: m[2].trim() };
  }
  return { name: 'FCAT ISO Audit System', email: fromStr.trim() };
}

function buildSubjectAndTag(notif: NotificationRecord): { subject: string; category: string; actionPath: string } {
  const ref = String(notif.RelatedCARNo || '').trim();
  const msg = String(notif.Message || '');

  if (ref.startsWith('HELP:')) {
    const ticketId = ref.slice(5);
    return {
      subject: `[FCAT Help Desk] Concern Update (${ticketId})`,
      category: 'Help Desk Concern',
      actionPath: '/?page=helpdesk',
    };
  }
  if (ref.startsWith('DM:')) {
    return {
      subject: `[FCAT Help Desk] New Direct Message`,
      category: 'Direct Message',
      actionPath: '/?page=helpdesk',
    };
  }
  if (ref) {
    const isFlag = msg.toLowerCase().includes('needs attention');
    const isDeadline = msg.toLowerCase().includes('deadline');
    const tag = isFlag ? 'Action Required' : isDeadline ? 'Deadline Notice' : 'CAR Notification';
    return {
      subject: `[FCAT ISO Audit] ${tag}: ${ref}`,
      category: tag,
      actionPath: `/?page=employee&car=${encodeURIComponent(ref)}`,
    };
  }

  return {
    subject: `[FCAT ISO Audit] System Notification`,
    category: 'Notification',
    actionPath: '/',
  };
}

export async function sendNotificationEmail(params: {
  toEmail: string;
  toName: string;
  fromName?: string;
  companyName?: string;
  notif: NotificationRecord;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { ok: false, skipped: true, error: 'Email delivery is not configured.' };
  }

  const toEmail = String(params.toEmail || '').trim();
  if (!toEmail || !toEmail.includes('@')) {
    return { ok: false, skipped: true, error: 'Invalid recipient email address.' };
  }

  const http = httpMailConfig();
  const cfg = smtpConfig();
  const appUrl = String(process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const companyName = params.companyName || 'Fernandez College of Arts And Technology, Inc. (FCAT)';
  const { subject, category, actionPath } = buildSubjectAndTag(params.notif);
  const targetUrl = `${appUrl}${actionPath}`;
  const ref = String(params.notif.RelatedCARNo || '').trim();
  const senderLabel = params.fromName ? `From: ${params.fromName}` : '';

  const text = [
    `Hello ${params.toName || 'User'},`,
    '',
    `You have a new ${category} in the ${companyName} ISO Audit Portal:`,
    '',
    params.notif.Message,
    ...(ref ? [`Reference: ${ref}`] : []),
    ...(senderLabel ? [senderLabel] : []),
    '',
    `Open Portal: ${targetUrl}`,
    '',
    '—',
    `${companyName} · ISO 9001:2015 Quality Management Portal`,
    'You can manage your email notification preferences anytime in Settings.',
  ].join('\n');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background:#F8F4F0;font-family:'Segoe UI',Arial,sans-serif;color:#2B2323;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;margin:0 auto;background:#FFFFFF;border:1px solid #EAD9D4;border-radius:10px;overflow:hidden;">
    <tr>
      <td style="background:#6B1A25;padding:18px 24px;color:#FFFFFF;">
        <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#F3DC99;font-weight:700;">${escapeHtml(category)}</div>
        <div style="font-size:17px;font-weight:700;margin-top:4px;">${escapeHtml(companyName)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <p style="margin:0 0 12px 0;font-size:14px;">Hello <strong>${escapeHtml(params.toName || 'User')}</strong>,</p>
        <div style="background:#FCF6F3;border:1px solid #EAD9D4;border-radius:8px;padding:14px 16px;font-size:14px;line-height:1.55;color:#2B2323;">
          ${escapeHtml(params.notif.Message)}
        </div>
        ${
          ref || senderLabel
            ? `<p style="margin:12px 0 0 0;font-size:12px;color:#6F6464;">${[
                ref ? `Reference: <strong>${escapeHtml(ref)}</strong>` : '',
                senderLabel ? escapeHtml(senderLabel) : '',
              ]
                .filter(Boolean)
                .join(' &nbsp;·&nbsp; ')}</p>`
            : ''
        }
        <div style="margin-top:20px;">
          <a href="${escapeHtml(targetUrl)}" style="display:inline-block;background:#6B1A25;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:700;padding:10px 18px;border-radius:7px;">
            View in Audit Portal
          </a>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 24px;background:#F8F4F0;border-top:1px solid #EAD9D4;font-size:11px;color:#6F6464;">
        Automatic notification from the FCAT ISO Audit &amp; CAR Management System. Manage your email preferences in Settings.
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  // 1. Google Apps Script HTTPS Webhook (works over HTTPS port 443 on Render Free Tier using @fcat.com.ph)
  if (http.googleWebhookUrl) {
    try {
      const resp = await fetch(http.googleWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: http.googleWebhookSecret,
          to: toEmail,
          toName: params.toName,
          subject,
          text,
          html,
        }),
        signal: AbortSignal.timeout(12000),
      });
      const bodyText = await resp.text();
      if (!resp.ok) {
        return { ok: false, error: `Google Mail Webhook error (${resp.status}): ${bodyText.slice(0, 200)}` };
      }
      try {
        const parsed = JSON.parse(bodyText);
        if (!parsed || parsed.ok !== true) {
          return { ok: false, error: parsed?.error || 'Google Mail Webhook rejected the request.' };
        }
        return { ok: true };
      } catch {
        return {
          ok: false,
          error:
            'Google Mail Webhook did not return JSON. In Apps Script, verify Deploy -> Web app is set to "Execute as: Me" and "Who has access: Anyone".',
        };
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Google Mail Webhook request failed.' };
    }
  }

  // 2. Brevo HTTPS API (port 443)
  if (http.brevoApiKey) {
    const sender = parseFromField(http.from || 'FCAT ISO Audit System <noreply@fcat.com.ph>');
    try {
      const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': http.brevoApiKey,
        },
        body: JSON.stringify({
          sender: { name: sender.name, email: sender.email },
          to: [{ email: toEmail, name: params.toName || toEmail }],
          subject,
          textContent: text,
          htmlContent: html,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        return { ok: false, error: `Brevo API error (${resp.status}): ${errBody.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Brevo API request failed.' };
    }
  }

  // 3. Resend HTTPS API (port 443)
  if (http.resendApiKey) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${http.resendApiKey}`,
        },
        body: JSON.stringify({
          from: http.from || 'FCAT ISO Audit System <onboarding@resend.dev>',
          to: [toEmail],
          subject,
          text,
          html,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        return { ok: false, error: `Resend API error (${resp.status}): ${errBody.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Resend API request failed.' };
    }
  }

  // 4. Direct SMTP via Nodemailer
  const transporter = getTransporter();
  if (!transporter) {
    return { ok: false, skipped: true, error: 'SMTP is not configured.' };
  }

  try {
    await transporter.sendMail({
      from: cfg.from || cfg.user,
      to: toEmail,
      subject,
      text,
      html,
    });
    return { ok: true };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'SMTP delivery failed.';
    if (/ETIMEDOUT|ECONNREFUSED|timeout/i.test(rawMsg)) {
      return {
        ok: false,
        error: `${rawMsg} — Note: Render Free Tier blocks outbound SMTP ports (465/587). Use GOOGLE_MAIL_WEBHOOK_URL, BREVO_API_KEY, or RESEND_API_KEY (HTTPS port 443) if hosted on Render Free Tier.`,
      };
    }
    if (/535|Username and Password not accepted|Invalid login/i.test(rawMsg)) {
      return {
        ok: false,
        error: 'SMTP authentication failed (535). Make sure SMTP_PASS is a 16-letter Google App Password, not your regular password.',
      };
    }
    return { ok: false, error: rawMsg };
  }
}
