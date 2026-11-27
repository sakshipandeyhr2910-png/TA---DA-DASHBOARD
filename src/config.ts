// Submission freeze (2026-11-27): no new TA/DA claims may be submitted from this dashboard.
// Existing claims stay editable. Flip to false to reopen (also set CLAIM_SUBMISSIONS_OPEN=true
// in the Vercel env — api/turso.js enforces the same freeze server-side).
export const SUBMISSIONS_CLOSED = true;
