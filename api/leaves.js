/**
 * Server-side employee leave fetch — credentials stay out of the browser bundle.
 * GET /api/leaves?empCode=2225
 * Returns all leave records for the given employee code.
 * Date-range filtering is handled client-side.
 */
import { getKoenigToken, invalidateKoenigToken } from '../lib/koenigAuth.js';

export const config = { maxDuration: 10 }; // Vercel Hobby plan hard cap

const BASE = 'https://api.koenig-solutions.com';

const LEAVE_USER = process.env.KOENIG_LEAVE_USER || '';
const LEAVE_PASS = process.env.KOENIG_LEAVE_PASS || '';
const LEAVE_ROLE = 'GetIncidentData';

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
    // Try numeric emp_code first (most APIs expect integer)
    const codeValue = /^\d+$/.test(empCode) ? parseInt(empCode, 10) : empCode;

    // Step 1+2 — get token (cached across warm invocations) and fetch leave records
    // (send emp_code; API returns all leaves for employee). If Koenig rejects a token the
    // cache still thought was fresh (another caller minted a newer session for the same
    // account), drop the cached session and retry once with a newly minted one.
    let data;
    for (let attempt = 0; attempt < 2; attempt++) {
      const tokenResult = await getToken(LEAVE_USER, LEAVE_PASS, LEAVE_ROLE);
      if (!tokenResult.ok) {
        return res.status(502).json({ error: tokenResult.error });
      }
      const { accessToken, deviceToken } = tokenResult.content;

      const dataUrl =
        `${BASE}/api/Kites/Operator/common` +
        `?apikey=237` +
        `&accessToken=${encodeURIComponent(accessToken)}` +
        `&deviceToken=${encodeURIComponent(deviceToken)}`;

      const dataRes = await fetch(dataUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emp_code: codeValue }),
      });

      if (!dataRes.ok) {
        return res.status(502).json({ error: `Leave API HTTP ${dataRes.status}` });
      }

      data = await dataRes.json();

      const denied = data.statuscode !== 200 && /forbidden|permission denied/i.test(String(data.message || ''));
      if (denied && attempt === 0) {
        await invalidateKoenigToken(LEAVE_USER, LEAVE_ROLE).catch(() => {});
        continue;
      }
      break;
    }

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
