// Vercel serverless function — HR action emails, OTP emails via Resend + Turso OTP storage.
// Requires RESEND_API_KEY and TURSO_* environment variables.

import { waitUntil } from '@vercel/functions';

// ── Turso helpers for OTP storage ─────────────────────────────────────────────
// Module-level cache — avoids repeated dynamic import + table creation on every request

let _dbClient = null;
let _tableReady = false;

async function getDb() {
  if (!_dbClient) {
    const { createClient } = await import('@libsql/client/http');
    const url       = (process.env.TURSO_DATABASE_URL  || '').replace(/^﻿/, '').trim();
    const authToken = (process.env.TURSO_AUTH_TOKEN    || '').replace(/^﻿/, '').trim();
    if (!url || !authToken) throw new Error('TURSO env vars not set');
    _dbClient = createClient({ url, authToken });
  }
  if (!_tableReady) {
    await _dbClient.execute('CREATE TABLE IF NOT EXISTS otp_sessions (email TEXT NOT NULL, otp TEXT NOT NULL, expires_at INTEGER NOT NULL)');
    _tableReady = true;
  }
  return _dbClient;
}

async function saveOtp(email, otp) {
  const db = await getDb();
  const expiresAt = Date.now() + 15 * 60 * 1000;
  await db.batch([
    { sql: 'DELETE FROM otp_sessions WHERE email = ? OR expires_at < ?', args: [email, Date.now()] },
    { sql: 'INSERT INTO otp_sessions (email, otp, expires_at) VALUES (?, ?, ?)', args: [email, otp, expiresAt] },
  ], 'write');
}

async function checkAndConsumeOtp(email, otp) {
  const db = await getDb();
  const result = await db.execute({
    sql: 'SELECT otp FROM otp_sessions WHERE email = ? AND otp = ? AND expires_at > ?',
    args: [email, otp, Date.now()],
  });
  if (result.rows.length === 0) return false;
  await db.execute({ sql: 'DELETE FROM otp_sessions WHERE email = ?', args: [email] });
  return true;
}

// ── OTP email template ────────────────────────────────────────────────────────

function buildOtpEmailHtml(trainerName, otp) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#1a56db 0%,#1e429f 100%);padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:600;">Koenig Solutions — TA/DA Portal</p>
          <h2 style="margin:8px 0 0;color:#fff;font-size:20px;font-weight:700;">Login Verification</h2>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;color:#374151;font-size:15px;">Hi <strong>${trainerName}</strong>,</p>
          <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">Your one-time password (OTP) for logging into the <strong>Koenig TA/DA Portal</strong> is:</p>
          <div style="text-align:center;margin:0 0 28px;">
            <span style="display:inline-block;background:#eff6ff;border:2px solid #bfdbfe;border-radius:12px;padding:18px 40px;font-size:40px;font-weight:800;letter-spacing:14px;color:#1e40af;">${otp}</span>
          </div>
          <p style="margin:0 0 8px;color:#6b7280;font-size:13px;text-align:center;">Valid for <strong>15 minutes</strong>. Do not share it with anyone.</p>
          <hr style="border:none;border-top:1px solid #f3f4f6;margin:28px 0 16px;"/>
          <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">If you did not attempt to log in, please ignore this email.</p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;text-align:center;">
          <p style="margin:0;color:#d1d5db;font-size:11px;">© 2026 Koenig Solutions Pvt. Ltd.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── HR action email template ──────────────────────────────────────────────────

const ACTION_LABELS = {
  approve: 'Approved ✅',
  'partial-approve': 'Partially Approved',
  reject: 'Rejected',
  hold: 'On Hold',
  'send-clarification': 'Clarification Required',
  'start-review': 'Under Review — HR Admin has started reviewing your claim',
  'start-review-again': 'Back Under Review',
  'mark-paid': 'Payment Processed',
};

const ACTION_COLORS = {
  approve: '#16a34a',
  'partial-approve': '#0d9488',
  reject: '#dc2626',
  hold: '#db2777',
  'send-clarification': '#ea580c',
  'start-review': '#d97706',
  'start-review-again': '#d97706',
  'mark-paid': '#7c3aed',
};

function buildEmailHtml({ claimId, billNo, trainerName, actionKey, actionLabel, remarks, hrName, approvedAmount, currency }) {
  const color = ACTION_COLORS[actionKey] ?? '#2563eb';
  const sym = (currency === 'INR' || !currency) ? '₹' : `${currency} `;
  // Always show Approved Amount — never conditional — so the trainer always sees exactly
  // what HR Admin approved for this action, regardless of whether it is zero or positive.
  const netLine = `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Approved Amount</td><td style="padding:6px 0;font-weight:700;font-size:15px;color:#16a34a;">${sym}${Math.abs(approvedAmount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:${color};padding:24px 32px;">
          <p style="margin:0;color:#ffffff;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:600;">Koenig Solutions — TA/DA Portal</p>
          <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;">Claim ${actionLabel}</h1>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 20px;font-size:15px;color:#111827;">Hi <strong>${trainerName}</strong>,</p>
          <p style="margin:0 0 24px;font-size:15px;color:#374151;">
            Your TA/DA claim has been <strong style="color:${color};">${actionLabel}</strong> by <strong>${hrName}</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Claim ID</td><td style="padding:6px 0;font-weight:600;font-size:14px;color:#111827;">${claimId}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Bill No</td><td style="padding:6px 0;font-weight:600;font-size:14px;color:#111827;">${billNo}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Status</td><td style="padding:6px 0;"><span style="background:${color}20;color:${color};padding:2px 10px;border-radius:20px;font-size:13px;font-weight:600;">${actionLabel}</span></td></tr>
            ${netLine}
          </table>
          ${remarks ? `
          <div style="background:#f9fafb;border-left:4px solid ${color};border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">HR Remarks</p>
            <p style="margin:0;font-size:14px;color:#111827;">${remarks}</p>
          </div>` : ''}
          <p style="margin:0;font-size:14px;color:#6b7280;">
            Please log in to the <strong>TA/DA Portal</strong> to view full details or take any required action.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
            This is an automated notification from Koenig Solutions TA/DA Portal. Do not reply to this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Visa Fees Entry action email template ─────────────────────────────────────

function buildVisaActionEmailHtml({ trainerName, entryLabel, statusLabel, color, amount, currency, date, reviewRemark }) {
  const sym = (currency === 'INR' || !currency) ? '₹' : `${currency} `;
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:${color};padding:24px 32px;">
          <p style="margin:0;color:#ffffff;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:600;">Koenig Solutions — TA/DA Portal</p>
          <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;">Visa Fees Entry ${statusLabel}</h1>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 20px;font-size:15px;color:#111827;">Hi <strong>${trainerName}</strong>,</p>
          <p style="margin:0 0 24px;font-size:15px;color:#374151;">
            Your <strong>${entryLabel}</strong> entry on the Visa Fees Entry page has been <strong style="color:${color};">${statusLabel}</strong> by <strong>HR Admin</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Entry Type</td><td style="padding:6px 0;font-weight:600;font-size:14px;color:#111827;">${entryLabel}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Date</td><td style="padding:6px 0;font-weight:600;font-size:14px;color:#111827;">${date ?? '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Status</td><td style="padding:6px 0;"><span style="background:${color}20;color:${color};padding:2px 10px;border-radius:20px;font-size:13px;font-weight:600;">${statusLabel}</span></td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Amount</td><td style="padding:6px 0;font-weight:700;font-size:15px;color:#16a34a;">${sym}${Math.abs(amount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td></tr>
          </table>
          ${reviewRemark ? `
          <div style="background:#f9fafb;border-left:4px solid ${color};border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">HR Remarks</p>
            <p style="margin:0;font-size:14px;color:#111827;">${reviewRemark}</p>
          </div>` : ''}
          <p style="margin:0;font-size:14px;color:#6b7280;">
            Please log in to the <strong>TA/DA Portal</strong> to view full details.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
            This is an automated notification from Koenig Solutions TA/DA Portal. Do not reply to this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── File upload via Vercel Blob ───────────────────────────────────────────────

async function handleUpload(req, res) {
  try {
    const { put } = await import('@vercel/blob');
    const filename = (req.headers['x-filename'] || `receipt-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const contentType = req.headers['content-type'] || 'application/octet-stream';
    const blob = await put(`receipts/${filename}`, req, {
      access: 'public',
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: String(err.message || err) });
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-filename');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  // GET is allowed ONLY for the Vercel Cron-triggered weekly report; everything else stays POST-only.
  if (req.method === 'GET' && req.query.type !== 'weekly_report') return res.status(405).json({ error: 'Method not allowed' });
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // File upload — streams raw body, must be handled before JSON parsing
  if (req.query.type === 'upload') return handleUpload(req, res);

  // Parse JSON body for all other request types
  const rawBody = await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
  let body = {};
  try { body = JSON.parse(rawBody); } catch { /* not JSON */ }

  const { type } = body;

  // ── OTP: generate, save to Turso, then send email in the background ─────────
  // The OTP is shown on-screen the moment it's saved to Turso — the trainer never
  // has to wait on (or be blocked by) email delivery. The email send still runs via
  // waitUntil so it completes after the response, as a backup record in the inbox.
  if (type === 'send-otp') {
    const { email, trainerName } = body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address is required.' });
    }
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const resendKey = (process.env.RESEND_API_KEY || '').trim();

    const otpSubject = `${otp} is your Koenig TA/DA Portal OTP`;
    const otpHtml    = buildOtpEmailHtml(trainerName || 'Trainer', otp);
    const otpText    = `Hi ${trainerName || 'Trainer'},\n\nYour OTP for Koenig TA/DA Portal login is: ${otp}\n\nValid for 15 minutes. Do not share this with anyone.\n\n-- Koenig Solutions`;

    const brevoKey  = (process.env.BREVO_API_KEY || '').trim();
    const brevoUser = (process.env.BREVO_USER || '').trim();
    const gmailUser = (process.env.GMAIL_USER || '').trim();
    const gmailPass = (process.env.GMAIL_APP_PASSWORD || '').trim();

    async function sendEmailWithFallback() {
      // 1. Try Resend
      if (resendKey) {
        try {
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Koenig TA/DA Portal <noreply@koenig-solutions.com>',
              to: [email],
              subject: otpSubject,
              text: otpText,
              html: otpHtml,
            }),
          });
          if (r.ok) { console.log(`OTP sent via Resend to ${email}`); return; }
          const errText = await r.text();
          console.error(`Resend OTP error ${r.status}: ${errText}`);
        } catch (e) { console.error('Resend OTP fetch error:', e && e.message); }
      }

      // 2. Try Brevo
      if (brevoKey) {
        try {
          const r = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sender: { name: 'Koenig TA/DA Portal', email: brevoUser || 'saurav.yadav@koenig-solutions.com' },
              to: [{ email }],
              subject: otpSubject,
              textContent: otpText,
              htmlContent: otpHtml,
            }),
          });
          if (r.ok) { console.log(`OTP sent via Brevo to ${email}`); return; }
          const errText = await r.text();
          console.error(`Brevo OTP error ${r.status}: ${errText}`);
        } catch (e) { console.error('Brevo OTP fetch error:', e && e.message); }
      }

      // 3. Try Gmail SMTP
      if (gmailUser && gmailPass) {
        const { createTransport } = await import('nodemailer');
        for (const cfg of [{ port: 587, secure: false }, { port: 465, secure: true }]) {
          try {
            const t = createTransport({ host: 'smtp.gmail.com', ...cfg, auth: { user: gmailUser, pass: gmailPass }, connectionTimeout: 8000, socketTimeout: 10000 });
            await t.sendMail({ from: `"Koenig TA/DA Portal" <${gmailUser}>`, to: email, subject: otpSubject, text: otpText, html: otpHtml });
            console.log(`OTP sent via Gmail (${cfg.port}) to ${email}`); return;
          } catch (e) { console.error(`Gmail (${cfg.port}) OTP error:`, e && e.message); }
        }
      }

      if (!resendKey && !brevoKey && !gmailUser) {
        console.log(`[DEV OTP] ${email} → ${otp}`); return;
      }

      console.error('All email providers failed for OTP to', email);
    }

    try {
      await saveOtp(email, otp);
    } catch (err) {
      console.error('OTP Turso save error:', err && err.message);
      return res.status(502).json({ error: 'Could not save OTP. Please try again.' });
    }

    // Fire-and-forget — do not block the response on email delivery.
    waitUntil(sendEmailWithFallback());

    // Return OTP so client can show it on screen — trainer can login instantly
    // without waiting for (or being blocked by) email delivery.
    return res.status(200).json({ success: true, otp });
  }

  // ── OTP step 2 (legacy no-op — kept for any in-flight requests) ───────────
  if (type === 'send-otp-email') {
    return res.status(200).json({ success: true });
  }

  // ── OTP: verify ───────────────────────────────────────────────────────────
  if (type === 'verify-otp') {
    const { email, otp } = body;
    if (!email || !otp) {
      return res.status(400).json({ valid: false, error: 'email and otp are required.' });
    }
    try {
      const valid = await checkAndConsumeOtp(email, String(otp));
      if (valid) return res.status(200).json({ valid: true });
      return res.status(200).json({ valid: false, error: 'Incorrect OTP or OTP has expired. Please try again.' });
    } catch (err) {
      console.error('OTP verify error:', err);
      return res.status(502).json({ valid: false, error: 'Verification failed. Please try again.' });
    }
  }

  // ── HR action / Koenig file emails — try Resend then Brevo then Gmail ──────
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  const brevoApiKey  = (process.env.BREVO_API_KEY  || '').trim();
  const brevoUser    = (process.env.BREVO_USER     || 'saurav.yadav@koenig-solutions.com').trim();
  const gmailUser    = (process.env.GMAIL_USER     || '').trim();
  const gmailPass    = (process.env.GMAIL_APP_PASSWORD || '').trim();

  async function sendHrEmail({ to, subject, html }) {
    // `to` may be a single email string or an array of emails
    const toList = Array.isArray(to) ? to : [to];
    // 1. Resend
    if (resendApiKey) {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'Koenig TA/DA Portal <noreply@koenig-solutions.com>', to: toList, subject, html }),
        });
        if (r.ok) { const d = await r.json(); console.log(`Action email sent via Resend to ${toList.join(', ')}`); return { sent: true, id: d.id }; }
        const errText = await r.text();
        console.error(`Resend error ${r.status}: ${errText}`);
      } catch (e) { console.error('Resend fetch error:', e && e.message); }
    }
    // 2. Brevo
    if (brevoApiKey) {
      try {
        const r = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender: { name: 'Koenig TA/DA Portal', email: brevoUser }, to: toList.map(email => ({ email })), subject, htmlContent: html }),
        });
        if (r.ok) { console.log(`Action email sent via Brevo to ${toList.join(', ')}`); return { sent: true, provider: 'brevo' }; }
        const errText = await r.text();
        console.error(`Brevo error ${r.status}: ${errText}`);
      } catch (e) { console.error('Brevo fetch error:', e && e.message); }
    }
    // 3. Gmail SMTP
    if (gmailUser && gmailPass) {
      const { createTransport } = await import('nodemailer');
      for (const cfg of [{ port: 587, secure: false }, { port: 465, secure: true }]) {
        try {
          const t = createTransport({ host: 'smtp.gmail.com', ...cfg, auth: { user: gmailUser, pass: gmailPass }, connectionTimeout: 8000, socketTimeout: 10000 });
          await t.sendMail({ from: `"Koenig TA/DA Portal" <${gmailUser}>`, to: toList.join(','), subject, html });
          console.log(`Action email sent via Gmail (${cfg.port}) to ${toList.join(', ')}`); return { sent: true, provider: 'gmail' };
        } catch (e) { console.error(`Gmail (${cfg.port}) error:`, e && e.message); }
      }
    }
    if (!resendApiKey && !brevoApiKey && !gmailUser) {
      console.log(`[DEV] Action email to ${toList.join(', ')} — subject: ${subject}`);
      return { sent: true, provider: 'dev-log' };
    }
    throw new Error('All email providers failed');
  }

  // Shared builder + sender for the Bills Summary Report — used by both the
  // manual "Email Bills Report" button and the automated weekly cron trigger.
  async function sendBillsReportEmail({ claims, sentBy, reportTo, periodLabel, excludeEmails }) {
    const defaultRecipients = [
      reportTo || 'saurav.yadav@koenig-solutions.com',
      'Sakshi.Pandey@koenig-solutions.com',
      'Rashi.Oberoi@koenig-solutions.com',
      'sakshi.dhawan@koenig-solutions.com',
    ];
    const excludeSet = new Set((Array.isArray(excludeEmails) ? excludeEmails : []).map(e => String(e).toLowerCase()));
    const recipient = defaultRecipients.filter(e => !excludeSet.has(e.toLowerCase()));
    if (recipient.length === 0) {
      const err = new Error('All recipients excluded — nobody to send to');
      err.statusCode = 400;
      throw err;
    }

    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const statusColor = { Submitted: '#3b82f6', Approved: '#10b981', 'Partially Approved': '#14b8a6', Paid: '#8b5cf6', 'Payment Pending': '#7c3aed' };
    const rowsHtml = claims.map((c, i) => `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f9fafb'};">
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${c.billNo ?? '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${c.trainerName ?? '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">
          <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:${statusColor[c.status] ? statusColor[c.status] + '22' : '#f3f4f6'};color:${statusColor[c.status] ?? '#6b7280'};">${c.status}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;text-align:right;">₹${(c.totalClaimedAmount ?? 0).toLocaleString('en-IN')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#059669;text-align:right;font-weight:600;">₹${(c.approvedAmount ?? 0).toLocaleString('en-IN')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${c.claimStartDate ?? ''}${c.claimEndDate && c.claimEndDate !== c.claimStartDate ? ' → ' + c.claimEndDate : ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${c.trainingLocation ?? '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${c.submittedAt ? new Date(c.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
      </tr>`).join('');

    const reportHtml = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#111827;margin:0;padding:0;">
      <div style="max-width:900px;margin:24px auto;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:linear-gradient(135deg,#1e40af,#0ea5e9);padding:24px 32px;">
          <h1 style="margin:0;color:#fff;font-size:22px;">📋 TA/DA Bills Summary Report</h1>
          <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">Generated ${today} · Sent by ${sentBy || 'HR Admin'}${periodLabel ? ' · Period: ' + periodLabel : ''}</p>
        </div>
        <div style="padding:20px 32px;overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;">
            <thead>
              <tr style="background:#1e40af;">
                <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;font-weight:600;white-space:nowrap;">Bill No</th>
                <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;font-weight:600;">Trainer</th>
                <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;font-weight:600;">Status</th>
                <th style="padding:10px 12px;text-align:right;color:#fff;font-size:12px;font-weight:600;">Claimed</th>
                <th style="padding:10px 12px;text-align:right;color:#fff;font-size:12px;font-weight:600;">Approved</th>
                <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;font-weight:600;">Period</th>
                <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;font-weight:600;">Location</th>
                <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;font-weight:600;">Submitted</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#9ca3af;">
          Koenig TA/DA Portal · This is an automated report
        </div>
      </div>
    </body></html>`;

    return sendHrEmail({ to: recipient, subject: `TA/DA Bills Report — ${claims.length} bills (${today})`, html: reportHtml });
  }

  // Shared builder + sender for the Out of Policy Report — bills where HR approved
  // more than the policy engine's computed eligible amount. Requires an HR Admin
  // remark explaining the override(s), which is shown prominently at the top of
  // the email alongside each bill's own historical admin remark.
  async function sendOutOfPolicyReportEmail({ bills, sentBy, hrRemark, reportTo, periodLabel, excludeEmails }) {
    const defaultRecipients = [
      reportTo || 'saurav.yadav@koenig-solutions.com',
      'Sakshi.Pandey@koenig-solutions.com',
      'Rashi.Oberoi@koenig-solutions.com',
      'sakshi.dhawan@koenig-solutions.com',
    ];
    const excludeSet = new Set((Array.isArray(excludeEmails) ? excludeEmails : []).map(e => String(e).toLowerCase()));
    const recipient = defaultRecipients.filter(e => !excludeSet.has(e.toLowerCase()));
    if (recipient.length === 0) {
      const err = new Error('All recipients excluded — nobody to send to');
      err.statusCode = 400;
      throw err;
    }

    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const fmt = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`;

    const rowsHtml = bills.map((b, i) => `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fef2f2'};">
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${b.billNo ?? '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${b.trainerName ?? '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${b.status ?? '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#059669;text-align:right;font-weight:600;">${fmt(b.approvedAmount)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;max-width:220px;">${b.adminRemark ? String(b.adminRemark).replace(/</g, '&lt;') : '—'}</td>
      </tr>`).join('');

    const reportHtml = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#111827;margin:0;padding:0;">
      <div style="max-width:960px;margin:24px auto;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:linear-gradient(135deg,#991b1b,#dc2626);padding:24px 32px;">
          <h1 style="margin:0;color:#fff;font-size:22px;">⚠️ Out of Policy Report</h1>
          <p style="margin:6px 0 0;color:#fecaca;font-size:13px;">Generated ${today} · Sent by ${sentBy || 'HR Admin'}${periodLabel ? ' · Period: ' + periodLabel : ''}</p>
        </div>
        <div style="padding:20px 32px 4px;display:flex;gap:16px;flex-wrap:wrap;">
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 18px;">
            <p style="margin:0;font-size:11px;color:#b91c1c;font-weight:600;text-transform:uppercase;">Bills in Report</p>
            <p style="margin:2px 0 0;font-size:22px;font-weight:800;color:#991b1b;">${bills.length}</p>
          </div>
        </div>
        ${hrRemark && String(hrRemark).trim() ? `
        <div style="padding:8px 32px 20px;">
          <p style="margin:0 0 4px;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;">HR Admin Remarks</p>
          <p style="margin:0;font-size:14px;color:#374151;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;line-height:1.5;">${String(hrRemark).replace(/</g, '&lt;')}</p>
        </div>` : ''}
        <div style="padding:0 32px 20px;overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;">
            <thead>
              <tr style="background:#991b1b;">
                <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;font-weight:600;white-space:nowrap;">Bill No</th>
                <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;font-weight:600;">Trainer</th>
                <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;font-weight:600;">Status</th>
                <th style="padding:10px 12px;text-align:right;color:#fff;font-size:12px;font-weight:600;">Approved</th>
                <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;font-weight:600;">Bill's HR Remark</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#9ca3af;">
          Koenig TA/DA Portal · This is an automated report
        </div>
      </div>
    </body></html>`;

    return sendHrEmail({ to: recipient, subject: `⚠️ Out of Policy Report — ${bills.length} bills (${today})`, html: reportHtml });
  }

  // ── Automated weekly report (Vercel Cron, GET request) ──────────────────────
  // Triggers every Monday at 08:00 IST (02:30 UTC) via vercel.json cron config.
  // Sends the previous calendar week's Monday–Friday Submitted/Approved/Paid bills
  // to the same 4 recipients as the manual "Email Bills Report" button.
  if (req.method === 'GET' && req.query.type === 'weekly_report') {
    try {
      const db = await getDb();
      const result = await db.execute('SELECT data FROM claims');
      const allStoredClaims = result.rows.map(r => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);

      const now = new Date();
      const dow = now.getUTCDay(); // 0=Sun..6=Sat
      const daysSinceMonday = (dow + 6) % 7;
      const thisMonday = new Date(now);
      thisMonday.setUTCDate(now.getUTCDate() - daysSinceMonday);
      const lastMonday = new Date(thisMonday);
      lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
      const lastFriday = new Date(lastMonday);
      lastFriday.setUTCDate(lastMonday.getUTCDate() + 4);
      const isoDate = d => d.toISOString().slice(0, 10);
      const from = isoDate(lastMonday);
      const to = isoDate(lastFriday);

      const REPORT_STATUSES = new Set(['Submitted', 'Approved', 'Partially Approved', 'Paid', 'Payment Pending']);
      const weekClaims = allStoredClaims
        .filter(c => REPORT_STATUSES.has(c.status))
        .filter(c => {
          const submittedDate = (c.submittedAt || '').slice(0, 10);
          return submittedDate && submittedDate >= from && submittedDate <= to;
        })
        .map(c => ({
          billNo: c.billNo, trainerName: c.trainerName, status: c.status,
          totalClaimedAmount: c.totalClaimedAmount ?? 0, approvedAmount: c.approvedAmount ?? 0,
          claimStartDate: c.claimStartDate ?? '', claimEndDate: c.claimEndDate ?? '',
          trainingLocation: c.trainingLocation ?? '', submittedAt: c.submittedAt ?? '',
        }));

      if (weekClaims.length === 0) {
        return res.status(200).json({ sent: false, reason: 'No bills submitted in the previous week', period: `${from} to ${to}` });
      }

      const sendResult = await sendBillsReportEmail({
        claims: weekClaims,
        sentBy: 'HR Admin (Automated Weekly Report)',
        periodLabel: `${from} to ${to}`,
      });
      return res.status(200).json({ ...sendResult, period: `${from} to ${to}`, billCount: weekClaims.length });
    } catch (err) {
      console.error('Weekly report cron error:', err && err.message);
      return res.status(500).json({ error: (err && err.message) || 'Weekly report failed' });
    }
  }

  const apiKey = resendApiKey; // kept for backward compat check below

  // ── Koenig file email ─────────────────────────────────────────────────────
  if (type === 'koenig_file') {
    const { attachmentBase64, attachmentFilename, rowCount, toEmail } = body;
    const financeEmail = process.env.FINANCE_EMAIL || toEmail;
    if (!financeEmail) return res.status(400).json({ error: 'No finance email configured' });
    if (!attachmentBase64 || !attachmentFilename) return res.status(400).json({ error: 'Missing attachment fields' });

    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const koenigHtml = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#111827;">
      <h2 style="color:#4f46e5;">Koenig TA/DA Payment File — ${today}</h2>
      <p>Please find attached the Koenig bank transfer file for <strong>${rowCount ?? 0}</strong> TA/DA claim(s).</p>
      <p>This file is in the Kotak bulk payment format and is ready to upload.</p>
    </body></html>`;
    try {
      // Koenig file needs attachment — use Resend directly (Brevo/Gmail need separate attachment handling)
      if (resendApiKey) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'TA/DA Portal <noreply@koenig-solutions.com>', to: [financeEmail],
            subject: `Koenig TADA Payment File — ${today}`, html: koenigHtml,
            attachments: [{ filename: attachmentFilename, content: attachmentBase64 }],
          }),
        });
        if (!response.ok) { const err = await response.text(); return res.status(502).json({ error: 'Email provider error', detail: err }); }
        const data = await response.json();
        return res.status(200).json({ sent: true, id: data.id });
      }
      // Fallback: send without attachment via Brevo
      const result = await sendHrEmail({ to: financeEmail, subject: `Koenig TADA Payment File — ${today}`, html: koenigHtml });
      return res.status(200).json(result);
    } catch (err) {
      return res.status(500).json({ error: 'Internal error sending email' });
    }
  }

  // ── Bills summary report email ────────────────────────────────────────────
  if (type === 'bills_report') {
    const { claims, sentBy, toEmail: reportTo, periodLabel, excludeEmails } = body;
    if (!Array.isArray(claims) || claims.length === 0)
      return res.status(400).json({ error: 'No claims data provided' });
    try {
      const result = await sendBillsReportEmail({ claims, sentBy, reportTo, periodLabel, excludeEmails });
      return res.status(200).json(result);
    } catch (err) {
      return res.status(err && err.statusCode === 400 ? 400 : 502).json({ error: (err && err.message) || 'Failed to send report email' });
    }
  }

  // ── Out of Policy Report email ────────────────────────────────────────────
  if (type === 'out_of_policy_report') {
    const { bills, sentBy, hrRemark, toEmail: oopReportTo, periodLabel: oopPeriodLabel, excludeEmails: oopExcludeEmails } = body;
    if (!Array.isArray(bills) || bills.length === 0)
      return res.status(400).json({ error: 'No out-of-policy bills provided' });
    try {
      const result = await sendOutOfPolicyReportEmail({ bills, sentBy, hrRemark, reportTo: oopReportTo, periodLabel: oopPeriodLabel, excludeEmails: oopExcludeEmails });
      return res.status(200).json(result);
    } catch (err) {
      return res.status(err && err.statusCode === 400 ? 400 : 502).json({ error: (err && err.message) || 'Failed to send report email' });
    }
  }

  // ── Visa Fees Entry approve/reject notification email ───────────────────────
  if (type === 'visa_action') {
    const { toEmail: visaToEmail, toName: visaToName, entryLabel, status, amount, currency: visaCurrency, date, reviewRemark } = body;
    if (!visaToEmail || !status) {
      return res.status(400).json({ error: 'Missing required fields: toEmail, status' });
    }
    const color = status === 'Approved' ? '#16a34a' : '#dc2626';
    const html = buildVisaActionEmailHtml({
      trainerName: visaToName ?? 'Trainer', entryLabel: entryLabel ?? 'Visa Fees',
      statusLabel: status, color, amount: amount ?? 0, currency: visaCurrency ?? 'INR',
      date, reviewRemark: reviewRemark || '',
    });
    const subject = `Visa Fees Entry ${status} — ${entryLabel ?? 'Visa Fees'}`;
    try {
      const result = await sendHrEmail({ to: visaToEmail, subject, html });
      return res.status(200).json(result);
    } catch (err) {
      console.error('All email providers failed for visa action:', err && err.message);
      return res.status(502).json({ error: 'All email providers failed', detail: err && err.message });
    }
  }

  // ── HR action notification email ──────────────────────────────────────────
  const { toEmail, toName, actionKey, claimId, billNo, remarks, hrName, approvedAmount, currency } = body;
  if (!toEmail || !actionKey || !claimId) {
    return res.status(400).json({ error: 'Missing required fields: toEmail, actionKey, claimId' });
  }

  const actionLabel = ACTION_LABELS[actionKey] ?? actionKey;
  const html = buildEmailHtml({
    claimId, billNo: billNo ?? claimId, trainerName: toName ?? 'Trainer',
    actionKey, actionLabel, remarks: remarks || '', hrName: hrName ?? 'HR Admin',
    approvedAmount: approvedAmount ?? 0, currency: currency ?? 'INR',
  });
  const subject = `TA/DA Claim ${actionLabel} — ${billNo ?? claimId}`;

  try {
    const result = await sendHrEmail({ to: toEmail, subject, html });
    return res.status(200).json(result);
  } catch (err) {
    console.error('All email providers failed for HR action:', err && err.message);
    return res.status(502).json({ error: 'All email providers failed', detail: err && err.message });
  }
}
