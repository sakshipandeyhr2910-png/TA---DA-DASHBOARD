/**
 * Shared Koenig PMS token cache, backed by Turso.
 *
 * Koenig's GetToken endpoint allows only ONE active session per (userName, userRole) —
 * issuing a new token instantly invalidates whatever token was previously issued for that
 * same account. Every api/*.js Koenig integration used to request and cache its own token
 * independently (in-memory, per serverless function), which meant any one endpoint calling
 * GetToken could silently knock out a token another endpoint was still using, surfacing as
 * random "403 Forbidden : Permission denied" errors.
 *
 * This module makes every endpoint share ONE live session per (userName, userRole) via a
 * Turso-backed cache, so a token is only refreshed when it has actually gone stale — not
 * every time a different function happens to need one. Lives outside api/ so it's bundled
 * as a plain dependency of whichever function imports it, not counted as its own serverless
 * function (this project is already at Vercel's Hobby-plan 12-function limit).
 *
 * NOTE: this narrows the race, it doesn't eliminate it — two requests that both see a stale
 * cache at the same instant will still each mint a token and the second wins. Fine for this
 * app's traffic; a real distributed lock would be overkill here.
 */

import { createClient } from '@libsql/client/http';

const BASE = 'https://api.koenig-solutions.com';
const TOKEN_TTL_MS = 8 * 60 * 1000; // refresh a couple minutes ahead of Koenig's own ~10min expiry

let _client = null;
function getDb() {
  if (_client) return _client;
  const url = (process.env.TURSO_DATABASE_URL || '').replace(/^﻿/, '').trim();
  const authToken = (process.env.TURSO_AUTH_TOKEN || '').replace(/^﻿/, '').trim();
  if (!url || !authToken) throw new Error('TURSO env vars not set');
  _client = createClient({ url, authToken });
  return _client;
}

let _tableReady = false;
async function ensureTable(db) {
  if (_tableReady) return;
  await db.execute(
    `CREATE TABLE IF NOT EXISTS koenig_tokens (
       cache_key TEXT PRIMARY KEY,
       access_token TEXT NOT NULL,
       device_token TEXT NOT NULL,
       expires_at INTEGER NOT NULL
     )`
  );
  _tableReady = true;
}

async function fetchFreshToken(userName, userPassword, userRole) {
  const res = await fetch(`${BASE}/api/Kites/Operator/GetToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName, userPassword, userRole }),
  });
  if (!res.ok) throw new Error(`Token HTTP ${res.status}`);
  const d = await res.json();
  if (d.statuscode !== 200) throw new Error(d.message || 'Token failed');
  return d.content; // { accessToken, deviceToken }
}

/**
 * Drops the cached session for (userName, userRole). Call this when Koenig rejects a
 * token the cache still considered fresh (something else minted a newer session for the
 * same account), then call getKoenigToken again to mint a replacement.
 */
export async function invalidateKoenigToken(userName, userRole) {
  const db = getDb();
  await ensureTable(db);
  await db.execute({
    sql: `DELETE FROM koenig_tokens WHERE cache_key = ?`,
    args: [`${userName}::${userRole}`],
  });
}

/**
 * Returns { accessToken, deviceToken } for (userName, userRole), reusing the session
 * cached in Turso when it's still fresh, minting a new one only when it has expired.
 */
export async function getKoenigToken(userName, userPassword, userRole) {
  const cacheKey = `${userName}::${userRole}`;
  const db = getDb();
  await ensureTable(db);

  const now = Date.now();
  const result = await db.execute({
    sql: `SELECT access_token, device_token, expires_at FROM koenig_tokens WHERE cache_key = ?`,
    args: [cacheKey],
  });
  const existing = result.rows[0];
  if (existing && Number(existing.expires_at) > now) {
    return { accessToken: existing.access_token, deviceToken: existing.device_token };
  }

  const fresh = await fetchFreshToken(userName, userPassword, userRole);
  const expiresAt = now + TOKEN_TTL_MS;
  await db.execute({
    sql: `INSERT INTO koenig_tokens (cache_key, access_token, device_token, expires_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(cache_key) DO UPDATE SET
            access_token = excluded.access_token,
            device_token = excluded.device_token,
            expires_at   = excluded.expires_at`,
    args: [cacheKey, fresh.accessToken, fresh.deviceToken, expiresAt],
  });
  return fresh;
}
