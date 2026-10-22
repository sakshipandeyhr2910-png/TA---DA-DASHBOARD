/**
 * Server-side employee leave fetch — credentials stay out of the browser bundle.
 * GET /api/leaves?empCode=2225
 * Returns all leave records for the given employee code.
 * Date-range filtering is handled client-side.
 */
import { getKoenigToken } from '../lib/koenigAuth.js';

export const config = { maxDuration: 10 }; // Vercel Hobby plan hard cap

const BASE = 'https://api.koenig-solutions.com';

async function getToken(userName, userPassword, userRole) {
  try {
    const content = await getKoenigToken(userName, userPassword, userRole);
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const raw     = String(req.query.empCode || '').trim();
  const empCode = raw.replace(/^EMP-/i, '').trim();

  if (!empCode) {
    return res.status(400).json({ error: 'empCode is required' });
  }

  try {
    // Step 1 — get token (cached across warm invocations)
    const tokenResult = await getToken(
      process.env.KOENIG_LEAVE_USER || '',
      process.env.KOENIG_LEAVE_PASS || '',
      'GetIncidentData'
    );
    if (!tokenResult.ok) {
      return res.status(502).json({ error: tokenResult.error });
    }
    const { accessToken, deviceToken } = tokenResult.content;

    // Step 2 — fetch leave records (send emp_code; API returns all leaves for employee)
    const dataUrl =
      `${BASE}/api/Kites/Operator/common` +
      `?apikey=237` +
      `&accessToken=${encodeURIComponent(accessToken)}` +
      `&deviceToken=${encodeURIComponent(deviceToken)}`;

    // Try numeric emp_code first (most APIs expect integer)
    const codeValue = /^\d+$/.test(empCode) ? parseInt(empCode, 10) : empCode;

    const dataRes = await fetch(dataUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emp_code: codeValue }),
    });

    if (!dataRes.ok) {
      return res.status(502).json({ error: `Leave API HTTP ${dataRes.status}` });
    }

    const data = await dataRes.json();

    if (data.statuscode !== 200) {
      // A genuinely empty leave record set still comes back as statuscode 200 with
      // content "[]" — a non-200 here is always a real failure (bad token, permission
      // denied, etc.), never "no leaves", so surface it instead of hiding it as empty.
      return res.status(502).json({ error: data.message || 'Leave API failed' });
    }

    let content = data.content;
    if (typeof content === 'string') {
      try { content = JSON.parse(content); } catch { content = []; }
    }
    if (!Array.isArray(content)) content = [];

    return res.status(200).json({ leaves: content });

  } catch (err) {
    return res.status(502).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
