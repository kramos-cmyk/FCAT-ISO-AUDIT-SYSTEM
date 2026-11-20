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
    return {
      configured: true,
      fromAddress: http.from || 'Google Workspace Apps Script',
      host: 'HTTPS Webhook',
      transport: 'google-webhook',
    };
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

function fmtShortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

async function deliverEmail(params: {
  toEmail: string;
  toName: string;
  subject: string;
  text: string;
  html: string;
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

  // 1. Google Apps Script HTTPS Webhook
  if (http.googleWebhookUrl) {
    try {
      const resp = await fetch(http.googleWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: http.googleWebhookSecret,
          to: toEmail,
          toName: params.toName,
          subject: params.subject,
          text: params.text,
          html: params.html,
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
          subject: params.subject,
          textContent: params.text,
          htmlContent: params.html,
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
          subject: params.subject,
          text: params.text,
          html: params.html,
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
      subject: params.subject,
      text: params.text,
      html: params.html,
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

function buildSubjectAndTag(notif: NotificationRecord): { subject: string; category: string; actionPath: string } {
  const ref = String(notif.RelatedCARNo || '').trim();
  const msg = String(notif.Message || '');
  const lower = msg.toLowerCase();

  if (ref.startsWith('HELP:')) {
    const ticketId = ref.slice(5);
    return {
      subject: `[FCAT Help Desk] Concern / Ticket Update (${ticketId})`,
      category: 'Help Desk Concern',
      actionPath: '/?page=helpdesk',
    };
  }
  if (ref.startsWith('AUDIT:')) {
    return {
      subject: `[FCAT ISO Audit] Audit Schedule Notice`,
      category: 'Audit Schedule',
      actionPath: '/',
    };
  }
  if (ref) {
    const tag = lower.includes('needs attention')
      ? 'Action Required'
      : lower.includes('deadline')
        ? 'Deadline Notice'
        : lower.includes('closed')
          ? 'CAR Closed'
          : lower.includes('reopened')
            ? 'CAR Reopened'
            : lower.includes('follow-up')
              ? 'Follow-Up Verification'
              : lower.includes('comment')
                ? 'CAR Comment'
                : lower.includes('has been raised')
                  ? 'New CAR Raised'
                  : 'CAR Update';
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
  // DPO & Security privacy guard: Direct Messages must never be emailed externally
  if (String(params.notif.RelatedCARNo || '').trim().startsWith('DM:')) {
    return { ok: false, skipped: true, error: 'Direct message emails are disabled for DPO & privacy compliance.' };
  }

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

  return deliverEmail({ toEmail: params.toEmail, toName: params.toName, subject, text, html });
}

export interface DigestMessageItem {
  messageId?: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
}

export async function sendConversationDigestEmail(params: {
  toEmail: string;
  toName: string;
  companyName?: string;
  conversationTitle: string;
  category: string;
  reference?: string;
  actionPath?: string;
  messages: DigestMessageItem[];
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const count = params.messages.length;
  if (count === 0) return { ok: false, skipped: true, error: 'Empty digest.' };

  const appUrl = String(process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const companyName = params.companyName || 'Fernandez College of Arts And Technology, Inc. (FCAT)';
  const targetUrl = `${appUrl}${params.actionPath || '/?page=helpdesk'}`;
  const countLabel = count === 1 ? '1 new message' : `${count} new messages`;
  const subject = `[FCAT Help Desk] ${countLabel} — ${params.conversationTitle}`;

  const textLines = [
    `Hello ${params.toName || 'User'},`,
    '',
    `You have ${countLabel} in ${params.conversationTitle}:`,
    '',
    ...params.messages.map((m) => {
      const t = fmtShortTime(m.createdAt);
      return `${t ? `[${t}] ` : ''}${m.senderName}: ${m.text}`;
    }),
    ...(params.reference ? ['', `Reference: ${params.reference}`] : []),
    '',
    `Open Conversation: ${targetUrl}`,
    '',
    '—',
    `${companyName} · ISO 9001:2015 Quality Management Portal`,
    'Messages are grouped automatically to avoid multiple emails during active conversations.',
  ];

  const htmlRows = params.messages
    .map((m) => {
      const t = fmtShortTime(m.createdAt);
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #F0E4DF;">
            <div style="font-size:12px;color:#6B1A25;font-weight:700;">
              ${escapeHtml(m.senderName)}${t ? ` <span style="font-weight:400;color:#7A6F6F;">· ${escapeHtml(t)}</span>` : ''}
            </div>
            <div style="font-size:13px;color:#2B2323;line-height:1.5;margin-top:3px;white-space:pre-wrap;">${escapeHtml(m.text)}</div>
          </td>
        </tr>`;
    })
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background:#F8F4F0;font-family:'Segoe UI',Arial,sans-serif;color:#2B2323;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;margin:0 auto;background:#FFFFFF;border:1px solid #EAD9D4;border-radius:10px;overflow:hidden;">
    <tr>
      <td style="background:#6B1A25;padding:18px 24px;color:#FFFFFF;">
        <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#F3DC99;font-weight:700;">${escapeHtml(params.category)} · ${escapeHtml(countLabel)}</div>
        <div style="font-size:17px;font-weight:700;margin-top:4px;">${escapeHtml(params.conversationTitle)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <p style="margin:0 0 12px 0;font-size:14px;">Hello <strong>${escapeHtml(params.toName || 'User')}</strong>, here is a summary of unread messages while you were away:</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FCF6F3;border:1px solid #EAD9D4;border-radius:8px;overflow:hidden;">
          ${htmlRows}
        </table>
        ${
          params.reference
            ? `<p style="margin:12px 0 0 0;font-size:12px;color:#6F6464;">Reference: <strong>${escapeHtml(params.reference)}</strong></p>`
            : ''
        }
        <div style="margin-top:20px;">
          <a href="${escapeHtml(targetUrl)}" style="display:inline-block;background:#6B1A25;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:700;padding:10px 18px;border-radius:7px;">
            Open Conversation in Portal
          </a>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 24px;background:#F8F4F0;border-top:1px solid #EAD9D4;font-size:11px;color:#6F6464;">
        Help Desk ticket updates are bundled automatically to reduce email volume. Manage preferences in Settings.
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  return deliverEmail({
    toEmail: params.toEmail,
    toName: params.toName,
    subject,
    text: textLines.join('\n'),
    html,
  });
}

export async function sendAnnouncementEmail(params: {
  toEmail: string;
  toName: string;
  postedByName: string;
  companyName?: string;
  title: string;
  message: string;
  imageCount?: number;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const appUrl = String(process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const companyName = params.companyName || 'Fernandez College of Arts And Technology, Inc. (FCAT)';
  const targetUrl = `${appUrl}/?page=announcements`;
  const subject = `[FCAT Announcement] ${params.title}`;
  const hasImages = Number(params.imageCount || 0) > 0;

  const text = [
    `Hello ${params.toName || 'User'},`,
    '',
    `A new announcement has been posted in the ${companyName} ISO Audit Portal:`,
    '',
    `Title: ${params.title}`,
    `Posted by: ${params.postedByName || 'Administrator'}`,
    '',
    params.message,
    ...(hasImages ? ['', `(${params.imageCount} attached image${params.imageCount === 1 ? '' : 's'} — open the portal to view)`] : []),
    '',
    `Open Announcements: ${targetUrl}`,
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
        <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#F3DC99;font-weight:700;">Official Announcement</div>
        <div style="font-size:17px;font-weight:700;margin-top:4px;">${escapeHtml(params.title)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <p style="margin:0 0 12px 0;font-size:14px;">Hello <strong>${escapeHtml(params.toName || 'User')}</strong>,</p>
        <div style="background:#FCF6F3;border:1px solid #EAD9D4;border-radius:8px;padding:14px 16px;font-size:14px;line-height:1.6;color:#2B2323;white-space:pre-wrap;">${escapeHtml(params.message)}</div>
        <p style="margin:12px 0 0 0;font-size:12px;color:#6F6464;">
          Posted by: <strong>${escapeHtml(params.postedByName || 'Administrator')}</strong>${
            hasImages
              ? ` &nbsp;·&nbsp; ${params.imageCount} attached image${params.imageCount === 1 ? '' : 's'}`
              : ''
          }
        </p>
        <div style="margin-top:20px;">
          <a href="${escapeHtml(targetUrl)}" style="display:inline-block;background:#6B1A25;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:700;padding:10px 18px;border-radius:7px;">
            View Announcement in Portal
          </a>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 24px;background:#F8F4F0;border-top:1px solid #EAD9D4;font-size:11px;color:#6F6464;">
        Sent to all active accounts from the ${escapeHtml(companyName)} ISO Audit &amp; CAR Management System. Manage preferences in Settings.
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  return deliverEmail({
    toEmail: params.toEmail,
    toName: params.toName,
    subject,
    text,
    html,
  });
}
