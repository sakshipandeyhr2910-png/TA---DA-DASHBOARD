import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { saveClaim, saveLineItems, saveDraftClaim, deleteDraftClaim, getDraftClaims, getClaims } from '../services/storageService';
import type { ClaimHeader, ClaimLineItem, ClaimAdvanceItem } from '../types';
import {
  Calendar, MapPin, Hotel, Building2, Ruler, Info,
  Plus, Trash2, Download, Upload, Send, Save,
  CheckCircle2, Loader2, AlertCircle, Search, X,
  Edit3, ChevronDown, ChevronUp, Plane, ExternalLink, DollarSign, MessageSquare,
} from 'lucide-react';
import type { User } from '../types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(iso: string) {
  if (!iso) return '—';
  // Parse as LOCAL date (not UTC) to avoid timezone shift in IST
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dayName(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short' });
}

function addDays(iso: string, n: number): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ── Get Trainer Assignment Details API (api_key=258) ─────────────────────────
// Replaces the old apikey=208 fetch. Includes city_of_training and training_venue
// directly, so the secondary apikey=190 lookup is no longer needed.

interface RawTrainerAssignment {
  // Identity
  AssignmentId:          number | null;
  BatchId?:              number | string | null;
  batch_id?:             number | string | null;
  // Course / Client
  CourseName:            string | null;
  course_name?:          string | null;
  ClientName?:           string | null;
  client_name?:          string | null;
  // Trainer
  TrainerName:           string | null;
  trainer_name?:         string | null;
  TrainerEmail:          string | null;
  trainer_email?:        string | null;
  trainer_emp_code:      number | string | null;
  // Batch type — apikey=208 returns "Batch_type"; apikey=258 returns "batch_delivery_mode"
  batch_delivery_mode:   string | null;
  BatchDeliveryMode?:    string | null;
  Batch_type?:           string | null;   // apikey=208 field (capital B and T)
  // New fields from apikey=208
  TotalPax?:             number | string | null;
  Manager?:              string | null;
  ManagerEmail?:         string | null;
  // Dates — combined string (most common)
  training_dates:        string | null;
  TrainingDates?:        string | null;
  // Dates — separate fields (all known Koenig API naming conventions)
  StarDate?:              string | null;  // apikey=208 typo for "StartDate"
  start_date?:            string | null;
  StartDate?:             string | null;
  AssignmentStartDate?:   string | null;
  assignment_start_date?: string | null;
  BatchStartDate?:        string | null;
  batch_start_date?:      string | null;
  TrainingStartDate?:     string | null;
  training_start_date?:   string | null;
  BatchFromDate?:         string | null;
  batch_from_date?:       string | null;
  FromDate?:              string | null;
  From_Date?:             string | null;
  from_date?:             string | null;
  DateFrom?:              string | null;
  date_from?:             string | null;
  BatchFrom?:             string | null;
  batch_from?:            string | null;
  AssignmentFrom?:        string | null;
  assignment_from?:       string | null;
  end_date?:              string | null;
  EndDate?:               string | null;
  AssignmentEndDate?:     string | null;
  assignment_end_date?:   string | null;
  BatchEndDate?:          string | null;
  batch_end_date?:        string | null;
  TrainingEndDate?:       string | null;
  training_end_date?:     string | null;
  BatchToDate?:           string | null;
  batch_to_date?:         string | null;
  ToDate?:                string | null;
  To_Date?:               string | null;
  to_date?:               string | null;
  DateTo?:                string | null;
  date_to?:               string | null;
  BatchTo?:               string | null;
  batch_to?:              string | null;
  AssignmentTo?:          string | null;
  assignment_to?:         string | null;
  // Location
  city_of_training:      string | null;
  CityOfTraining?:       string | null;
  City?:                 string | null;
  city?:                 string | null;
  Country?:              string | null;
  country?:              string | null;
  CountryName?:          string | null;
  country_name?:         string | null;
  training_venue:        string | null;
  TrainingVenue?:        string | null;
  Venue?:                string | null;
  venue?:                string | null;
  VenueName?:            string | null;
  venue_name?:           string | null;
  training_location?:    string | null;
  TrainingLocation?:     string | null;
  Location?:             string | null;
  location?:             string | null;
  // SCID / Participants / Time variants
  SCID?:                 number | string | null;
  scid?:                 number | string | null;
  Scid?:                 number | string | null;
  SCID_No?:              number | string | null;
  scid_no?:              number | string | null;
  NoOfParticipants?:     number | string | null;
  no_of_participants?:   number | string | null;
  participants?:         number | string | null;
  Participants?:         number | string | null;
  participant_count?:    number | string | null;
  ParticipantCount?:     number | string | null;
  Start_time?:           string | null;
  start_time?:           string | null;
  StartTime?:            string | null;
  Start_Time?:           string | null;
  batch_start_time?:     string | null;
  session_start_time?:   string | null;
  training_start_time?:  string | null;
  time_from?:            string | null;
  end_time?:             string | null;
  End_time?:             string | null;
  EndTime?:              string | null;
  End_Time?:             string | null;
  batch_end_time?:       string | null;
  session_end_time?:     string | null;
  training_end_time?:    string | null;
  time_to?:              string | null;
  [key: string]: unknown;
}

// Pick the first non-empty string value from a list of field names on a raw record
function pickStr(r: RawTrainerAssignment, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v != null && String(v).trim() !== '' && String(v).trim().toLowerCase() !== 'null') {
      return String(v).trim();
    }
  }
  return '';
}

// Pick a parsed ISO date (YYYY-MM-DD) from the first resolvable date field
function pickDate(r: RawTrainerAssignment, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k] as string | null;
    if (!v) continue;
    const parsed = parseApiDate(String(v));
    if (parsed) return parsed;
  }
  return '';
}

// Parse "23-Feb-2026" or "23-Jul-2026" → "2026-02-23"
const MONTH_MAP: Record<string, string> = {
  Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
  Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12',
};
function parseApiDate(raw: string | null): string {
  if (!raw) return '';
  const s = raw.trim();
  if (!s || s === 'null' || s === 'undefined') return '';

  // ISO: "2026-07-23" or "2026-07-23T..."
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // Helper: normalise a 2- or 4-digit year string → 4-digit
  function fullYear(y: string): string {
    return /^\d{2}$/.test(y) ? `20${y}` : y;
  }
  // Helper: month abbreviation → zero-padded number
  function monToMM(mon: string): string {
    const key = mon.charAt(0).toUpperCase() + mon.slice(1, 3).toLowerCase();
    return MONTH_MAP[key] ?? MONTH_MAP[mon] ?? '';
  }

  // "DD-Mon-YYYY" or "DD-Mon-YY"  e.g. "23-Jul-2026", "23-Jul-26"
  const dashParts = s.split('-');
  if (dashParts.length === 3) {
    const [dd, mon, yy] = dashParts;
    if (/^\d{1,2}$/.test(dd.trim()) && /^\d{2,4}$/.test(yy.trim())) {
      const mm = monToMM(mon.trim());
      if (mm) return `${fullYear(yy.trim())}-${mm}-${dd.trim().padStart(2, '0')}`;
    }
  }

  // "DD/MM/YYYY" or "DD/MM/YY"
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, dd, mm, yy] = slashMatch;
    return `${fullYear(yy)}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  // "DD Mon YYYY" or "D Mon YYYY"  e.g. "23 Jul 2026"
  const spaceMatch = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/);
  if (spaceMatch) {
    const [, dd, mon, yy] = spaceMatch;
    const mm = monToMM(mon);
    if (mm) return `${fullYear(yy)}-${mm}-${dd.padStart(2, '0')}`;
  }

  // "Mon DD, YYYY" or "Mon DD YYYY"  e.g. "Jul 23, 2026"
  const monDayMatch = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (monDayMatch) {
    const [, mon, dd, yy] = monDayMatch;
    const mm = monToMM(mon);
    if (mm) return `${fullYear(yy)}-${mm}-${dd.padStart(2, '0')}`;
  }

  // "YYYY/MM/DD"
  const ymdSlash = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymdSlash) {
    const [, yyyy, mm, dd] = ymdSlash;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  return ''; // unrecognised format — return empty rather than a garbage slice
}

// Parse training_dates field, e.g.:
//   "23-Jul-2026 to 30-Jul-2026"
//   "2026-07-23 to 2026-07-30"
//   "23-Jul-2026 - 30-Jul-2026"
//   "23-Jul-2026"   (single date)
function parseTrainingDates(raw: string | null): { startDate: string; endDate: string } {
  if (!raw) return { startDate: '', endDate: '' };
  const s = raw.trim();

  // Try multi-char separators first (order matters — " - " before "-")
  const separators = [' to ', ' TO ', ' - ', ' / ', ' | ', ' ~ '];
  for (const sep of separators) {
    if (s.includes(sep)) {
      const idx = s.indexOf(sep);
      const left  = s.slice(0, idx).trim();
      const right = s.slice(idx + sep.length).trim();
      const startDate = parseApiDate(left);
      const endDate   = parseApiDate(right);
      if (startDate || endDate) return { startDate, endDate };
    }
  }

  // Comma-separated with same-month shorthand: "Jul 23, 30 2026" → skip (too ambiguous)
  // Just try parsing the whole string as a single date
  const single = parseApiDate(s);
  return { startDate: single, endDate: single };
}

// Normalize an emp code: strip leading zeros so "01234" and "1234" match the same trainer
function normalizeEmpCode(c: string | number | null | undefined): string {
  if (c == null) return '';
  const s = String(c).trim();
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s.toLowerCase();
}

// Filter raw records to only this trainer by checking every possible emp-code field name
function filterByEmpCode(raw: RawTrainerAssignment[], empCode: string): RawTrainerAssignment[] {
  const userNorm = normalizeEmpCode(empCode);
  return raw.filter((r: RawTrainerAssignment) => {
    const rec = r as Record<string, unknown>;
    const apiRaw =
      rec['trainer_emp_code'] ??
      rec['TrainerEmpCode']   ??
      rec['trainerEmpCode']   ??
      rec['emp_code']         ??
      rec['EmpCode']          ??
      rec['empCode']          ??
      rec['EmployeeCode']     ??
      rec['employee_code']    ??
      null;
    if (apiRaw == null) return true; // no emp-code field — trust API already filtered
    return normalizeEmpCode(apiRaw as string | number) === userNorm;
  });
}

function logApiRecords(apiLabel: string, raw: RawTrainerAssignment[], fromDate: string, toDate: string) {
  if (raw.length > 0) {
    console.group(`[${apiLabel}] ${raw.length} record(s) for ${fromDate} → ${toDate}`);
    console.log('Fields:', Object.keys(raw[0]));
    raw.forEach((r: RawTrainerAssignment, i: number) => {
      const rec = r as Record<string, unknown>;
      const dates: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rec)) {
        if (/date|star|start|end|from|to|training/i.test(k)) dates[k] = v;
      }
      console.log(
        `[${i}] id=${r.AssignmentId} emp=${r.trainer_emp_code}` +
        ` course=${r.CourseName} Batch_type=${r.Batch_type} bdm=${r.batch_delivery_mode}`,
        dates,
      );
    });
    console.groupEnd();
  } else {
    console.warn(`[${apiLabel}] Empty response for ${fromDate} → ${toDate}`);
  }
}

async function fetchTrainerAssignments(
  fromDate: string,
  toDate: string,
  empCode: string,
): Promise<RawTrainerAssignment[]> {
  const clean = empCode.replace(/^EMP-/i, '').trim();
  const params = new URLSearchParams({ empCode: clean, from: fromDate, to: toDate });
  const res = await fetch(`/api/assignments?${params}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Assignments HTTP ${res.status}`);
  let raw: RawTrainerAssignment[] = Array.isArray(data.assignments) ? data.assignments : [];
  logApiRecords(`API ${data.source}`, raw, fromDate, toDate);
  raw = filterByEmpCode(raw, empCode);
  console.log(`[API ${data.source}] After emp-code filter (${clean}): ${raw.length} record(s)`);
  return raw;
}

// ── Employee Leave Details API (api_key=237) ─────────────────────────────────

interface LeaveRecord {
  // Primary fields (camelCase variants used by older backend versions)
  emp_name: string | null;
  emp_code: string | null;
  from_date: string | null;
  from_time: string | null;
  to_date: string | null;
  to_time: string | null;
  leave_status: string | null;
  leave_approval_date: string | null;
  leave_type: string | null;
  // Alternate casing variants returned by some API versions
  Emp_Name?: string | null;
  Emp_Code?: string | null;
  From_Date?: string | null;
  To_Date?: string | null;
  Leave_Status?: string | null;
  Leave_Type?: string | null;
  Leave_Approval_Date?: string | null;
  // Half-day / duration fields
  half_day?: string | null;
  is_half_day?: boolean | null;
  duration?: string | null;
  no_of_days?: number | null;
  [key: string]: unknown;
}

// Normalise a LeaveRecord so downstream code can always use lowercase field names
function normalizeLeaveRecord(r: LeaveRecord): LeaveRecord {
  return {
    emp_name:            r.emp_name  ?? r.Emp_Name  ?? null,
    emp_code:            r.emp_code  ?? r.Emp_Code  ?? null,
    from_date:           r.from_date ?? r.From_Date ?? null,
    from_time:           r.from_time ?? null,
    to_date:             r.to_date   ?? r.To_Date   ?? null,
    to_time:             r.to_time   ?? null,
    leave_status:        r.leave_status ?? r.Leave_Status ?? null,
    leave_approval_date: r.leave_approval_date ?? r.Leave_Approval_Date ?? null,
    leave_type:          r.leave_type ?? r.Leave_Type ?? null,
    half_day:            r.half_day  ?? null,
    is_half_day:         r.is_half_day ?? null,
    duration:            r.duration  ?? null,
    no_of_days:          r.no_of_days ?? null,
  };
}

// Parse "DD-Mon-YYYY", "DD/MM/YYYY", "YYYY-MM-DDTHH:mm:ss", "YYYY-MM-DD"
// Manual per-record exception list — for a specific PMS leave record that HR Admin has
// confirmed is incorrect (trainer was NOT actually on leave that day) but which the PMS
// leave API still returns. Does not change the leave-fetching/auto-mark logic or API for
// any other employee/date — only suppresses this exact (empCode, date) from counting as a
// leave day. Keyed as "<empCode>|<ISO date>". Add entries only on explicit HR confirmation.
// Vaibhav Gupta EMP-2361, 2026-08-04: confirmed by HR Admin he was not on leave that day.
// Aastha Mehta EMP-3681, 2026-10-12: PMS API 237 returns an approved leave that RMS does not have.
const LEAVE_RECORD_OVERRIDE_EXCLUDE = new Set<string>([
  '2361|2026-08-04',
  '3681|2026-10-12',
]);

function leavesInRange(all: LeaveRecord[], fromDate: string, toDate: string): LeaveRecord[] {
  // Client-side safety filter: keep only leaves that overlap the selected range
  // (server already filters, but guard against stale/unfiltered responses)
  const inRange = all.filter(r => {
    const fd = parseLeaveDate(r.from_date);
    const td = parseLeaveDate(r.to_date) || fd;
    if (!fd) return false;
    // Overlap: leave starts before range end AND leave ends after range start
    return fd <= toDate && td >= fromDate;
  });
  inRange.sort((a, b) => parseLeaveDate(a.from_date).localeCompare(parseLeaveDate(b.from_date)));
  return inRange;
}

// Recomputes the leave-day set from the live PMS response. Only APPROVED leaves are marked
// — a Cancelled or still-Pending record must not suppress DA (matches ClaimDetail.tsx's
// approvedLeaveDates). Days covered by ANY PMS record, whatever its status, are taken from
// PMS alone, so a leave cancelled since the last load (or since a draft was saved) drops out
// instead of staying marked; days outside every PMS record keep their existing (manual) marks.
function mergeLeaveDates(
  prev: Set<string>,
  inRange: LeaveRecord[],
  fromDate: string,
  toDate: string,
  overrideEmpCode: string,
): Set<string> {
  const covered = new Set<string>();
  const approved = new Set<string>();
  inRange.forEach(r => {
    const fd = parseLeaveDate(r.from_date);
    const td = parseLeaveDate(r.to_date) || fd;
    if (!fd) return;
    const isApproved = isApprovedLeave(r.leave_status);
    // Expand every calendar day in [fd, td] using UTC-only arithmetic to avoid
    // any local timezone shift (e.g. UTC-5 would shift date by -1 day otherwise).
    let cur = fd;
    while (cur <= td) {
      if (cur >= fromDate && cur <= toDate) {
        covered.add(cur);
        if (isApproved && !LEAVE_RECORD_OVERRIDE_EXCLUDE.has(`${overrideEmpCode}|${cur}`)) approved.add(cur);
      }
      // Increment by 1 day — pure UTC, no local timezone involved
      const [y, m, d] = cur.split('-').map(Number);
      cur = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    }
  });
  const next = new Set<string>();
  prev.forEach(d => { if (!covered.has(d)) next.add(d); });
  approved.forEach(d => next.add(d));
  return next;
}

function parseLeaveDate(raw: string | null): string {
  if (!raw) return '';
  const s = raw.trim();
  if (!s || s === 'null') return '';
  // ISO: 2026-07-01... or 2026-07-01T00:00:00
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('/');
    return `${yyyy}-${mm}-${dd}`;
  }
  // DD-Mon-YYYY  e.g. "01-Jul-2026"
  const monMatch = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (monMatch) {
    const [, dd, mon, yyyy] = monMatch;
    const mm = MONTH_MAP[mon] ?? MONTH_MAP[mon.charAt(0).toUpperCase() + mon.slice(1).toLowerCase()] ?? '01';
    return `${yyyy}-${mm}-${dd.padStart(2, '0')}`;
  }
  // DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('-');
    return `${yyyy}-${mm}-${dd}`;
  }
  return s.slice(0, 10);
}

// Returns true if a leave_status string represents an approved/accepted leave
function isApprovedLeave(status: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return (
    s.includes('approv') ||
    s.includes('sanction') ||
    s.includes('accept') ||
    s.includes('granted') ||
    s === 'approved' ||
    s === 'sanctioned' ||
    s === 'accepted'
  );
}

// Returns true if leave is pending/in-review
function isPendingLeave(status: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return s.includes('pending') || s.includes('review') || s.includes('submitted');
}

// Returns true if leave was cancelled/revoked/rejected
function isCancelledLeave(status: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return (
    s.includes('cancel') ||
    s.includes('revok') ||
    s.includes('reject') ||
    s.includes('withdraw') ||
    s.includes('denied') ||
    s === 'cancelled' ||
    s === 'canceled' ||
    s === 'rejected' ||
    s === 'revoked'
  );
}

async function fetchEmployeeLeaves(
  empCode: string,
  fromDate: string,
  toDate: string,
): Promise<LeaveRecord[]> {
  // Use the local Vite middleware (or Vercel serverless on prod) — credentials never in browser
  const clean = empCode.replace(/^EMP-/i, '').trim();
  const res = await fetch(`/api/leaves?empCode=${encodeURIComponent(clean)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as { error?: string }).error || `Leave API HTTP ${res.status}`);
  }
  const data = await res.json() as { leaves?: LeaveRecord[]; error?: string };
  if (data.error) throw new Error(data.error);

  let leaves = data.leaves ?? [];

  // Client-side date filter — API returns all leaves, we filter to the selected range
  if ((fromDate || toDate) && leaves.length > 0) {
    leaves = leaves.filter((l) => {
      const lFrom = (l.from_date || '').slice(0, 10);
      const lTo   = (l.to_date   || '').slice(0, 10);
      if (fromDate && lTo   && lTo   < fromDate) return false;
      if (toDate   && lFrom && lFrom > toDate)   return false;
      return true;
    });
  }

  return leaves.map(normalizeLeaveRecord);
}

// ── Get Trainer Flight & Travel Details API (apikey=256) ─────────────────────
// Replaces apikey=108 (email-based). Now uses emp_code, same as assignments.

interface FlightRecord {
  trip_ID: number | null;
  flight_number: string | null;
  from_city: string | null;
  to_city: string | null;
  departure_date: string | null;   // "2026-07-04T00:00:00" or "04-Jul-2026"
  departure_time: string | null;   // "16:00:00"
  arrival_date: string | null;
  arrival_time: string | null;
  connecting_flight_id: number | null;
  Is_cancelled: string | null;     // "Yes" | "No" | null
  ticket_path: string | null;
  insurance_path: string | null;
  airlines_name: string | null;
  transport_type: string | null;   // "Flight" | "Train" | "Bus" | etc.
  [key: string]: unknown;
}

async function fetchTrainerFlights(empCode: string, email?: string): Promise<FlightRecord[]> {
  const clean = empCode.replace(/^EMP-/i, '').trim();
  const params = new URLSearchParams({ empCode: clean });
  if (email) params.set('email', email);
  const res = await fetch(`/api/flights?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Flights fetch HTTP ${res.status}`);
  const raw = Array.isArray(data.flights) ? data.flights : [];
  if (raw.length > 0) {
    console.log('[API flights] records:', raw.length, '| sample:', JSON.stringify(raw[0], null, 2));
  }
  return raw;
}

// Robust date parser — handles ISO, DD-Mon-YYYY, DD/MM/YYYY, DD-MM-YYYY, Mon DD YYYY
function parseDT(dt: string | null): string {
  if (!dt) return '';
  const s = dt.trim();
  // ISO / ISO-with-time: 2026-04-26 or 2026-04-26T00:00:00
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Mon DD YYYY: "Apr 24 2026 12:00AM" — actual Koenig PMS advance date format
  const mddyMatch = s.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/);
  if (mddyMatch) {
    const [, mon, dd, yyyy] = mddyMatch;
    const key = mon.charAt(0).toUpperCase() + mon.slice(1).toLowerCase();
    const mm = MONTH_MAP[mon] ?? MONTH_MAP[key] ?? '01';
    return `${yyyy}-${mm}-${dd.padStart(2, '0')}`;
  }
  // DD-Mon-YYYY: 26-Apr-2026
  const monMatch = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (monMatch) {
    const [, dd, mon, yyyy] = monMatch;
    const mm = MONTH_MAP[mon] ?? MONTH_MAP[mon.charAt(0).toUpperCase() + mon.slice(1).toLowerCase()] ?? '01';
    return `${yyyy}-${mm}-${dd.padStart(2, '0')}`;
  }
  // DD/MM/YYYY: 26/04/2026
  const slashMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    return `${yyyy}-${mm}-${dd}`;
  }
  // DD-MM-YYYY: 26-04-2026 (Koenig PMS advance date format)
  const dmyMatch = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmyMatch) {
    const [, dd, mm, yyyy] = dmyMatch;
    return `${yyyy}-${mm}-${dd}`;
  }
  return s.slice(0, 10);
}

function parseTM(t: string | null): string {
  if (!t) return '';
  // "16:00:00" → "16:00"  |  "4:00 PM" → keep as-is
  return t.length >= 5 ? t.slice(0, 5) : t;
}

// ── Trainer Accommodation API (api_key=120) ───────────────────────────────────

// ── Get Trainer Accommodation Details API (apikey=257) ────────────────────────
// Replaces apikey=120 (email-based). Now uses emp_code, same as assignments.

interface AccommodationRecord {
  EmpId: number | null;
  TrainerName: string | null;
  RoomNo: string | null;
  AccommodationName: string | null;
  CityName: string | null;
  CheckInDate: string | null;    // "2026-07-04T00:00:00"
  CheckOutDate: string | null;
  Nights: number | null;
  StayDates: string | null;      // e.g. "04-Jul-2026 to 06-Jul-2026"
  Is_caneclled: string | number | null;   // "0"/0 = active, "1"/1 = cancelled (note: API spelling)
  AccommodationPDF: string | null;
  [key: string]: unknown;
}

async function fetchTrainerAccommodation(empCode: string): Promise<AccommodationRecord[]> {
  const clean = empCode.replace(/^EMP-/i, '').trim();
  const res = await fetch(`/api/accommodation?empCode=${encodeURIComponent(clean)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Accommodation fetch HTTP ${res.status}`);
  const raw = Array.isArray(data.accommodation) ? data.accommodation : [];
  if (raw.length > 0) {
    console.log('[API 257] records:', raw.length, '| sample:', JSON.stringify(raw[0], null, 2));
  }
  return raw;
}

function accomDT(dt: string | null): string {
  if (!dt) return '';
  const s = dt.trim();
  // ISO: "2026-07-04" or "2026-07-04T00:00:00"
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD-Mon-YYYY e.g. "04-Jul-2026"
  const monMatch = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (monMatch) {
    const [, dd, mon, yyyy] = monMatch;
    const mm = MONTH_MAP[mon] ?? MONTH_MAP[mon.charAt(0).toUpperCase() + mon.slice(1).toLowerCase()] ?? '01';
    return `${yyyy}-${mm}-${dd.padStart(2, '0')}`;
  }
  // DD/MM/YYYY
  const slashMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    return `${yyyy}-${mm}-${dd}`;
  }
  // fallback — take first 10 chars (works for plain ISO)
  return s.slice(0, 10);
}

// ── Country List API (apikey=223) ────────────────────────────────────────────

interface KoenigCountry { CountryId: number | null; CountryName: string | null; }

async function fetchCountryList(): Promise<KoenigCountry[]> {
  const res = await fetch('/api/countries');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Country list HTTP ${res.status}`);
  return Array.isArray(data.countries) ? (data.countries as KoenigCountry[]) : [];
}

// ── Employee Advance List API (apikey=259) ────────────────────────────────────

interface RawAdvanceRecord {
  // Actual field names returned by Koenig PMS API 259
  Date:      string | null;   // "Apr 24 2026 12:00AM"
  Amount:    string | null;   // "25400.00"
  Currency:  string | null;
  TABillID:  string | null;
  Type:      string | null;   // "BankTransfer" | "ByCash"
  Status:    string | null;
  Narration: string | null;   // e.g. "TABill 82432-3162"
  [key: string]: unknown;
}

async function fetchEmployeeAdvances(empCode: string): Promise<RawAdvanceRecord[]> {
  const clean = empCode.replace(/^EMP-/i, '').trim();
  const res = await fetch(`/api/advances?empCode=${encodeURIComponent(clean)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Advances fetch HTTP ${res.status}`);
  const raw = Array.isArray(data.advances) ? data.advances : [];
  if (raw.length > 0) {
    console.log('[API 259] records:', raw.length, '| sample:', JSON.stringify(raw[0], null, 2));
  }
  return raw as RawAdvanceRecord[];
}

// ── Lodging entry (hotel stay in this page) ───────────────────────────────────

type LodgingStayType = 'Apartment' | 'Hotel' | 'Guest House' | 'PG' | 'Other';

interface LodgingEntry {
  id: string;
  hotelName: string;
  city: string;
  roomNo: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  ratePerNight: number;
  receipt: string;
  source: 'pms' | 'manual';
  stayType: LodgingStayType;
}

// Detect apartment from accommodation name — strict keyword match on "apartment"
// Covers: "GGN Apartment", "Koenig Apartment", "Serviced Apartment", "XYZ Apartments", etc.
function isApartmentName(name: string): boolean {
  return /apartment/i.test(name || '');
}

// Infer stay type from accommodation name string (PMS or manual entry)
function inferStayType(name: string): LodgingStayType {
  if (isApartmentName(name)) return 'Apartment';
  const n = (name || '').toLowerCase();
  if (/pg|paying.?guest|hostel/.test(n)) return 'PG';
  if (/guest.?house|guesthouse|transit.?house/.test(n)) return 'Guest House';
  if (/hotel|inn|lodge|resort|suites?|oyo|ibis|lemon|marriott|hyatt|hilton|sheraton|radisson|novotel|courtyard|holiday|sarovar|lalit/.test(n)) return 'Hotel';
  return 'Other';
}

// ── Assignment model ──────────────────────────────────────────────────────────

interface Assignment {
  id: string;
  courseName: string;
  clientName: string;
  city: string;
  country: string;
  hotelName: string;
  venueName: string;
  distanceKm: string;
  startDate: string;
  endDate: string;
  assignmentId: string;
  batchId?: string;
  source: 'api' | 'manual';
  // Fields from apikey=258
  trainerName?: string;
  trainerEmail?: string;
  trainingVenue?: string;   // training_venue from API
  trainingDates?: string | null;  // raw training_dates from API; null = inferred from date range
  manager?: string;
  totalPax?: string;
  batchType?: string;       // batch_delivery_mode: ILO | ILT | FMAT
  batchCategory?: string;
  deliveryMode?: string;    // derived: Online | Offline | Hybrid
  scid?: string;
  noOfParticipants?: number;
  startTime?: string;       // e.g. "15:0" from Start_time
  endTime?: string;         // e.g. "17:0" from end_time
}

function deriveDeliveryMode(bdm: string): string {
  const v = bdm.toUpperCase().trim();
  // ILO → Online (Instructor-Led Online)
  if (v === 'ILO' || v.startsWith('ILO')) return 'Online';
  // FMAT → Offline (Face-to-face)
  if (v === 'FMAT' || v.startsWith('FMAT')) return 'Offline';
  // ILT → Offline (Instructor-Led Training)
  if (v === 'ILT' || v.startsWith('ILT')) return 'Offline';
  return 'Offline'; // unknown → treat as Offline (eligible for TA/DA)
}

// City → Country lookup for apikey=258 (which returns city_of_training but no country)
const CITY_COUNTRY_MAP: Record<string, string> = {
  // Comprehensive world city→country map, merged and kept in sync across CreateTADABill.tsx
  // and assignmentMapper.ts on 2026-08-10 — both files must use the IDENTICAL list.
  "aalborg": "Denmark", "aarhus": "Denmark", "aba": "Nigeria", "aberdeen": "UK", "abha": "Saudi Arabia",
  "abidjan": "Ivory Coast", "abu dhabi": "United Arab Emirates", "abuja": "Nigeria", "acapulco": "Mexico",
  "accra": "Ghana", "adana": "Turkey", "addis": "Ethiopia", "addis ababa": "Ethiopia", "addu": "Maldives",
  "addu city": "Maldives", "adelaide": "Australia", "aden": "Yemen", "aden'a": "Yemen", "afghanistan": "Afghanistan",
  "agra": "India", "aguascalientes": "Mexico", "ahmedabad": "India", "ahvaz": "Iran",
  "ajman": "United Arab Emirates", "aktobe": "Kazakhstan", "akyab": "Myanmar", "al ain": "United Arab Emirates",
  "al khobar": "Saudi Arabia", "albuquerque": "USA", "aleppo": "Syria", "alexandria": "Egypt", "algeria": "Algeria",
  "algiers": "Algeria", "ali sabieh": "Djibouti", "alicante": "Spain", "almaty": "Kazakhstan", "america": "USA",
  "amman": "Jordan", "ampang": "Malaysia", "ampara": "Sri Lanka", "amritsar": "India", "amsterdam": "Netherlands",
  "andijan": "Uzbekistan", "andorra la vella": "Andorra", "angeles": "Philippines", "angola": "Angola",
  "ankara": "Turkey", "annaba": "Algeria", "antalya": "Turkey", "antananarivo": "Madagascar",
  "antipolo": "Philippines", "antofagasta": "Chile", "antsirabe": "Madagascar", "antwerp": "Belgium",
  "anuradhapura": "Sri Lanka", "apia": "Samoa", "aqaba": "Jordan", "arequipa": "Peru", "argentina": "Argentina",
  "arugam bay": "Sri Lanka", "arusha": "Tanzania", "ashdod": "Israel", "ashgabat": "Turkmenistan",
  "asmara": "Eritrea", "asmera": "Eritrea", "astana": "Kazakhstan", "asuncion": "Paraguay", "asunción": "Paraguay",
  "aswan": "Egypt", "athens": "Greece", "atlanta": "USA", "auckland": "New Zealand", "aurangabad": "India",
  "austin": "USA", "australia": "Australia", "austria": "Austria", "bacolod": "Philippines", "badulla": "Sri Lanka",
  "bafoussam": "Cameroon", "bagerhat": "Bangladesh", "baghdad": "Iraq", "bago": "Myanmar", "baguio": "Philippines",
  "bahrain": "Bahrain", "baku": "Azerbaijan", "bali": "Indonesia", "balikpapan": "Indonesia", "balti": "Moldova",
  "baltimore": "USA", "bamako": "Mali", "bambari": "Central African Republic", "bamenda": "Cameroon",
  "bandar abbas": "Iran", "bandar seri begawan": "Brunei", "bandung": "Indonesia", "banepa": "Nepal",
  "bangalore": "India", "bangkok": "Thailand", "bangladesh": "Bangladesh", "bangui": "Central African Republic",
  "banja luka": "Bosnia and Herzegovina", "barcelona": "Spain", "bari": "Italy", "barisal": "Bangladesh",
  "barishal": "Bangladesh", "baroda": "India", "barquisimeto": "Venezuela", "barranquilla": "Colombia",
  "basel": "Switzerland", "basra": "Iraq", "bassein": "Myanmar", "basseterre": "Saint Kitts and Nevis",
  "bata": "Equatorial Guinea", "batam": "Indonesia", "battambang": "Cambodia", "batticaloa": "Sri Lanka",
  "batumi": "Georgia", "baucau": "East Timor", "beer sheva": "Israel", "beijing": "China", "beira": "Mozambique",
  "beirut": "Lebanon", "bekasi": "Indonesia", "belem": "Brazil", "belfast": "UK", "belgium": "Belgium",
  "belgrade": "Serbia", "belize city": "Belize", "belmopan": "Belize", "belo horizonte": "Brazil", "belém": "Brazil",
  "bengaluru": "India", "benghazi": "Libya", "benguela": "Angola", "benin city": "Nigeria", "bentota": "Sri Lanka",
  "berbera": "Somalia", "bergen": "Norway", "berlin": "Germany", "bern": "Switzerland", "beruwala": "Sri Lanka",
  "bethlehem": "Palestine", "bgc": "Philippines", "bhadgaon": "Nepal", "bhairahawa": "Nepal", "bhaktapur": "Nepal",
  "bharatpur": "Nepal", "bhola": "Bangladesh", "bhopal": "India", "bhubaneswar": "India", "bhutan": "Bhutan",
  "bien hoa": "Vietnam", "bilbao": "Spain", "biratnagar": "Nepal", "birendranagar": "Nepal", "birgunj": "Nepal",
  "birmingham": "UK", "bishkek": "Kyrgyzstan", "bissau": "Guinea-Bissau", "bitola": "North Macedonia",
  "bizerte": "Tunisia", "blantyre": "Malawi", "blida": "Algeria", "bloemfontein": "South Africa",
  "bo": "Sierra Leone", "bobo-dioulasso": "Burkina Faso", "bogor": "Indonesia", "bogota": "Colombia",
  "bogotá": "Colombia", "bogra": "Bangladesh", "bogura": "Bangladesh", "bolivia": "Bolivia", "bologna": "Italy",
  "bombay": "India", "bonifacio global city": "Philippines", "bordeaux": "France", "bosaso": "Somalia",
  "boston": "USA", "bouake": "Ivory Coast", "bradford": "UK", "braga": "Portugal", "brahmanbaria": "Bangladesh",
  "brampton": "Canada", "brasilia": "Brazil", "brasília": "Brazil", "bratislava": "Slovakia", "brazil": "Brazil",
  "brazzaville": "Republic of Congo", "breda": "Netherlands", "bremen": "Germany", "bridgetown": "Barbados",
  "brikama": "Gambia", "brisbane": "Australia", "bristol": "UK", "britain": "UK", "brno": "Czech Republic",
  "bruges": "Belgium", "brunei": "Brunei", "brussels": "Belgium", "bsb": "Brunei", "bucaramanga": "Colombia",
  "bucharest": "Romania", "budapest": "Hungary", "buenos aires": "Argentina", "bujumbura": "Burundi",
  "bukavu": "Democratic Republic of the Congo", "bukhara": "Uzbekistan", "bulawayo": "Zimbabwe",
  "bumthang": "Bhutan", "bunia": "Democratic Republic of the Congo", "buon ma thuot": "Vietnam",
  "buraidah": "Saudi Arabia", "burgas": "Bulgaria", "burma": "Myanmar", "bursa": "Turkey", "burundi": "Burundi",
  "busan": "South Korea", "butare": "Rwanda", "butuan": "Philippines", "butwal": "Nepal",
  "cagayan de oro": "Philippines", "cairns": "Australia", "cairo": "Egypt", "calcutta": "India", "calgary": "Canada",
  "cali": "Colombia", "caloocan": "Philippines", "cambodia": "Cambodia", "cambridge": "UK", "cameroon": "Cameroon",
  "campo grande": "Brazil", "can tho": "Vietnam", "canada": "Canada", "canberra": "Australia", "cancun": "Mexico",
  "cape town": "South Africa", "caracas": "Venezuela", "cardiff": "UK", "cartagena": "Colombia",
  "casablanca": "Morocco", "castries": "Saint Lucia", "catania": "Italy", "cebu": "Philippines", "chad": "Chad",
  "chandigarh": "India", "changsha": "China", "chapainawabganj": "Bangladesh", "charlotte": "USA",
  "chattogram": "Bangladesh", "chelyabinsk": "Russia", "chengdu": "China", "chennai": "India", "chhukha": "Bhutan",
  "chiang mai": "Thailand", "chiang rai": "Thailand", "chiba": "Japan", "chicago": "USA", "chiclayo": "Peru",
  "chilaw": "Sri Lanka", "chile": "Chile", "china": "China", "chipata": "Zambia", "chisinau": "Moldova",
  "chittagong": "Bangladesh", "chitungwiza": "Zimbabwe", "chișinău": "Moldova", "chongqing": "China",
  "christchurch": "New Zealand", "chukha": "Bhutan", "ciudad juarez": "Mexico", "clark": "Philippines",
  "cluj": "Romania", "cluj-napoca": "Romania", "cochabamba": "Bolivia", "cochin": "India", "coimbatore": "India",
  "coimbra": "Portugal", "cologne": "Germany", "colombia": "Colombia", "colombo": "Sri Lanka", "columbus": "USA",
  "comilla": "Bangladesh", "conakry": "Guinea", "concepcion": "Chile", "concepción": "Chile", "constanta": "Romania",
  "constantine": "Algeria", "copenhagen": "Denmark", "cordoba": "Argentina", "cork": "Ireland",
  "cotabato": "Philippines", "cotonou": "Benin", "coventry": "UK", "cox's bazar": "Bangladesh",
  "coxs bazar": "Bangladesh", "cuba": "Cuba", "cuenca": "Ecuador", "culiacan": "Mexico", "cumilla": "Bangladesh",
  "curitiba": "Brazil", "cusco": "Peru", "cuzco": "Peru", "cyberjaya": "Malaysia", "córdoba": "Argentina",
  "córdoba es": "Spain", "da nang": "Vietnam", "daegu": "South Korea", "daejeon": "South Korea", "dagana": "Bhutan",
  "dagupan": "Philippines", "dakar": "Senegal", "dalat": "Vietnam", "dalian": "China", "dallas": "USA",
  "daloa": "Ivory Coast", "damak": "Nepal", "damascus": "Syria", "dambulla": "Sri Lanka", "dammam": "Saudi Arabia",
  "dar es salaam": "Tanzania", "darkhan": "Mongolia", "darwin": "Australia", "daugavpils": "Latvia",
  "davao": "Philippines", "dawei": "Myanmar", "debrecen": "Hungary", "dehradun": "India", "deir ez-zor": "Syria",
  "delhi": "India", "denmark": "Denmark", "denver": "USA", "depok": "Indonesia", "detroit": "USA",
  "dhahran": "Saudi Arabia", "dhaka": "Bangladesh", "dhaka north": "Bangladesh", "dhaka south": "Bangladesh",
  "dhangadhi": "Nepal", "dharan": "Nepal", "dharwad": "India", "dhulikhel": "Nepal", "dili": "East Timor",
  "dinajpur": "Bangladesh", "dire dawa": "Ethiopia", "djibouti": "Djibouti", "djibouti city": "Djibouti",
  "dnipro": "Ukraine", "dodoma": "Tanzania", "doha": "Qatar", "dongguan": "China", "dortmund": "Germany",
  "douala": "Cameroon", "drammen": "Norway", "dresden": "Germany", "dubai": "United Arab Emirates",
  "dublin": "Ireland", "dubrovnik": "Croatia", "dunedin": "New Zealand", "durban": "South Africa",
  "durres": "Albania", "durrës": "Albania", "dushanbe": "Tajikistan", "dusseldorf": "Germany",
  "düsseldorf": "Germany", "east london": "South Africa", "ecuador": "Ecuador", "edinburgh": "UK",
  "edmonton": "Canada", "egypt": "Egypt", "eindhoven": "Netherlands", "eldoret": "Kenya", "ella": "Sri Lanka",
  "emirates": "United Arab Emirates", "england": "UK", "entebbe": "Uganda", "erbil": "Iraq", "erdenet": "Mongolia",
  "ermita": "Philippines", "esbjerg": "Denmark", "espoo": "Finland", "essen": "Germany", "ethiopia": "Ethiopia",
  "faisalabad": "Pakistan", "fallujah": "Iraq", "famagusta": "Cyprus", "faridabad": "India",
  "faridpur": "Bangladesh", "faro": "Portugal", "feni": "Bangladesh", "fergana": "Uzbekistan", "fez": "Morocco",
  "fianarantsoa": "Madagascar", "finland": "Finland", "florence": "Italy", "florianopolis": "Brazil",
  "fortaleza": "Brazil", "foshan": "China", "france": "France", "francistown": "Botswana", "frankfurt": "Germany",
  "freetown": "Sierra Leone", "fresno": "USA", "fujairah": "United Arab Emirates", "fukuoka": "Japan",
  "funafuti": "Tuvalu", "funchal": "Portugal", "fuvahmulah": "Maldives", "fuzhou": "China", "gaborone": "Botswana",
  "galle": "Sri Lanka", "galway": "Ireland", "gampaha": "Sri Lanka", "ganja": "Azerbaijan", "gao": "Mali",
  "garoua": "Cameroon", "gasa": "Bhutan", "gatwick": "UK", "gaza": "Palestine", "gaziantep": "Turkey",
  "gazipur": "Bangladesh", "gbarnga": "Liberia", "gdansk": "Poland", "geelong": "Australia", "gelephu": "Bhutan",
  "general santos": "Philippines", "geneva": "Switzerland", "genoa": "Italy", "genova": "Italy",
  "georgetown": "Guyana", "germany": "Germany", "ghana": "Ghana", "ghent": "Belgium", "ghorahi": "Nepal",
  "gibraltar": "Gibraltar", "gitarama": "Rwanda", "gitega": "Burundi", "giza": "Egypt", "glasgow": "UK",
  "goa": "India", "goiania": "Brazil", "gold coast": "Australia", "goma": "Democratic Republic of the Congo",
  "gomel": "Belarus", "gondar": "Ethiopia", "gopalganj": "Bangladesh", "gothenburg": "Sweden", "granada": "Spain",
  "graz": "Austria", "greensboro": "USA", "greenwood": "USA", "grenoble": "France", "grodno": "Belarus",
  "groningen": "Netherlands", "guadalajara": "Mexico",
  "guangzhou": "China", "guatemala city": "Guatemala", "guayaquil": "Ecuador", "gujranwala": "Pakistan",
  "gurgaon": "India", "gurugram": "India", "guwahati": "India", "guyana": "Guyana", "gwangju": "South Korea",
  "gweru": "Zimbabwe", "gyumri": "Armenia", "haa": "Bhutan", "habana": "Cuba", "haifa": "Israel",
  "haiphong": "Vietnam", "hakha": "Myanmar", "hama": "Syria", "hamadan": "Iran", "hambantota": "Sri Lanka",
  "hamburg": "Germany", "hamilton": "New Zealand", "hamilton on": "Canada", "hangzhou": "China",
  "hannover": "Germany", "hanoi": "Vietnam", "harare": "Zimbabwe", "harbin": "China", "hargeisa": "Somalia",
  "hat yai": "Thailand", "havana": "Cuba", "hawassa": "Ethiopia", "heathrow": "UK", "hebron": "Palestine",
  "hefei": "China", "helsinki": "Finland", "heraklion": "Greece", "herat": "Afghanistan", "hermosillo": "Mexico",
  "hetauda": "Nepal", "hikkaduwa": "Sri Lanka", "hinthada": "Myanmar", "hiroshima": "Japan",
  "ho chi minh": "Vietnam", "ho chi minh city": "Vietnam", "hobart": "Australia", "homs": "Syria",
  "hong kong": "Hong Kong", "honiara": "Solomon Islands", "houston": "USA", "hpa an": "Myanmar", "hpa-an": "Myanmar",
  "hsinchu": "Taiwan", "hua hin": "Thailand", "huambo": "Angola", "hubli": "India", "hudaydah": "Yemen",
  "hue": "Vietnam", "hurghada": "Egypt", "hyderabad": "India", "hyderabad pk": "Pakistan", "iasi": "Romania",
  "iași": "Romania", "ibadan": "Nigeria", "iligan": "Philippines", "iloilo": "Philippines", "inaruwa": "Nepal",
  "incheon": "South Korea", "indianapolis": "USA", "indonesia": "Indonesia", "indore": "India",
  "innsbruck": "Austria", "ipoh": "Malaysia", "iquique": "Chile", "iquitos": "Peru", "iran": "Iran", "iraq": "Iraq",
  "irbid": "Jordan", "isfahan": "Iran", "islamabad": "Pakistan", "ismailia": "Egypt", "israel": "Israel",
  "istanbul": "Turkey", "itahari": "Nepal", "italy": "Italy", "izmir": "Turkey", "jabalpur": "India",
  "jacksonville": "USA", "jaffna": "Sri Lanka", "jaipur": "India", "jakarta": "Indonesia",
  "jalal-abad": "Kyrgyzstan", "jalalabad": "Afghanistan", "jamaica": "Jamaica", "jamalpur": "Bangladesh",
  "janakpur": "Nepal", "janakpurdham": "Nepal", "japan": "Japan", "jashore": "Bangladesh",
  "jebel ali": "United Arab Emirates", "jeddah": "Saudi Arabia", "jenin": "Palestine", "jericho": "Palestine",
  "jerusalem": "Israel", "jessore": "Bangladesh", "jhalokathi": "Bangladesh", "jinan": "China", "jinja": "Uganda",
  "joao pessoa": "Brazil", "jodhpur": "India", "johannesburg": "South Africa", "johor bahru": "Malaysia",
  "jordan": "Jordan", "jos": "Nigeria", "jounieh": "Lebanon", "juarez": "Mexico", "jubail": "Saudi Arabia",
  "jyväskylä": "Finland", "kabul": "Afghanistan", "kabwe": "Zambia", "kaduna": "Nigeria", "kairouan": "Tunisia",
  "kalay": "Myanmar", "kalmunai": "Sri Lanka", "kalutara": "Sri Lanka", "kampala": "Uganda",
  "kandahar": "Afghanistan", "kandy": "Sri Lanka", "kankan": "Guinea", "kano": "Nigeria", "kansas city": "USA",
  "kaohsiung": "Taiwan", "karachi": "Pakistan", "karaganda": "Kazakhstan", "karaj": "Iran", "karakol": "Kyrgyzstan",
  "karbala": "Iraq", "kassala": "Sudan", "kathmandu": "Nepal", "katowice": "Poland", "kaunas": "Lithuania",
  "kawasaki": "Japan", "kawkareik": "Myanmar", "kayseri": "Turkey", "kazan": "Russia", "keelung": "Taiwan",
  "kegalle": "Sri Lanka", "kenema": "Sierra Leone", "kengtung": "Myanmar", "kenya": "Kenya", "keren": "Eritrea",
  "kharkiv": "Ukraine", "khartoum": "Sudan", "khobar": "Saudi Arabia", "khon kaen": "Thailand",
  "khujand": "Tajikistan", "khulna": "Bangladesh", "kiev": "Ukraine", "kigali": "Rwanda", "kilinochchi": "Sri Lanka",
  "kimberley": "South Africa", "kingston": "Jamaica", "kingstown": "Saint Vincent and the Grenadines",
  "kinshasa": "Democratic Republic of the Congo", "kirkuk": "Iraq", "kirtipur": "Nepal",
  "kisangani": "Democratic Republic of the Congo", "kishorganj": "Bangladesh", "kismayo": "Somalia",
  "kisumu": "Kenya", "kitakyushu": "Japan", "kitwe": "Zambia", "kl": "Malaysia", "klagenfurt": "Austria",
  "klaipeda": "Lithuania", "klaipėda": "Lithuania", "klang": "Malaysia", "kobe": "Japan", "kochi": "India",
  "kolkata": "India", "konya": "Turkey", "korat": "Thailand", "koror": "Palau", "kota kinabalu": "Malaysia",
  "kotte": "Sri Lanka", "koudougou": "Burkina Faso", "kragujevac": "Serbia", "krakow": "Poland",
  "kuala belait": "Brunei", "kuala lampur": "Malaysia", "kuala lumpur": "Malaysia", "kuching": "Malaysia",
  "kulob": "Tajikistan", "kumamoto": "Japan", "kumasi": "Ghana", "kunduz": "Afghanistan", "kunming": "China",
  "kurunegala": "Sri Lanka", "kushtia": "Bangladesh", "kutaisi": "Georgia", "kuwait": "Kuwait",
  "kuwait city": "Kuwait", "kyaingtong": "Myanmar", "kyaukpyu": "Myanmar", "kyiv": "Ukraine", "kyoto": "Japan",
  "la": "USA", "la ceiba": "Honduras", "la paz": "Bolivia", "la plata": "Argentina", "lae": "Papua New Guinea",
  "lagos": "Nigeria", "lahore": "Pakistan", "lalitpur": "Nepal", "laoag": "Philippines", "laos": "Laos",
  "larissa": "Greece", "larnaca": "Cyprus", "las pinas": "Philippines", "las piñas": "Philippines",
  "las vegas": "USA", "lashio": "Myanmar", "latakia": "Syria", "lausanne": "Switzerland", "lebanon": "Lebanon",
  "leeds": "UK", "legazpi": "Philippines", "leicester": "UK", "leipzig": "Germany", "lekhnath": "Nepal",
  "leon": "Mexico", "lhuntse": "Bhutan", "libreville": "Gabon", "libya": "Libya", "liege": "Belgium",
  "lille": "France", "lilongwe": "Malawi", "lima": "Peru", "limassol": "Cyprus", "limerick": "Ireland",
  "linkoping": "Sweden", "linköping": "Sweden", "linz": "Austria", "lisbon": "Portugal", "liverpool": "UK",
  "livingstone": "Zambia", "liège": "Belgium", "ljubljana": "Slovenia", "lobamba": "Eswatini", "lobito": "Angola",
  "lodz": "Poland", "loikaw": "Myanmar", "lombok": "Indonesia", "lome": "Togo", "lomé": "Togo", "london": "UK",
  "london city": "UK", "los angeles": "USA", "louisville": "USA", "luanda": "Angola", "luang prabang": "Laos",
  "lubango": "Angola", "lublin": "Poland", "lubumbashi": "Democratic Republic of the Congo", "lucknow": "India",
  "lusaka": "Zambia", "luxembourg": "Luxembourg", "luxembourg city": "Luxembourg", "luxor": "Egypt",
  "lviv": "Ukraine", "lyon": "France", "macao": "China", "macau": "China", "maceio": "Brazil",
  "madang": "Papua New Guinea", "madaripur": "Bangladesh", "madhyapur thimi": "Nepal", "madras": "India",
  "madrid": "Spain", "madurai": "India", "magway": "Myanmar", "magwe": "Myanmar", "mahajanga": "Madagascar",
  "maiduguri": "Nigeria", "majuro": "Marshall Islands", "makassar": "Indonesia", "makati": "Philippines",
  "malabo": "Equatorial Guinea", "malabon": "Philippines", "malaga": "Spain", "malawi": "Malawi",
  "malaysia": "Malaysia", "maldives": "Maldives", "male": "Maldives", "mali": "Mali", "malindi": "Kenya",
  "malmo": "Sweden", "malmö": "Sweden", "malé": "Maldives", "manado": "Indonesia", "managua": "Nicaragua",
  "manama": "Bahrain", "manaus": "Brazil", "manchester": "UK", "mandalay": "Myanmar", "mandaluyong": "Philippines",
  "mangalore": "India", "mangaluru": "India", "manikganj": "Bangladesh", "manila": "Philippines",
  "mannar": "Sri Lanka", "maputo": "Mozambique", "mar del plata": "Argentina", "maracaibo": "Venezuela",
  "maradi": "Niger", "marikina": "Philippines", "marrakech": "Morocco", "marseille": "France",
  "mary": "Turkmenistan", "maseru": "Lesotho", "mashhad": "Iran", "massawa": "Eritrea", "matale": "Sri Lanka",
  "matara": "Sri Lanka", "maun": "Botswana", "mawlamyine": "Myanmar", "maymyo": "Myanmar",
  "mazar-e-sharif": "Afghanistan", "mazar-i-sharif": "Afghanistan", "mbabane": "Eswatini",
  "mbuji-mayi": "Democratic Republic of the Congo", "mecca": "Saudi Arabia", "mechinagar": "Nepal",
  "medan": "Indonesia", "medellin": "Colombia", "medellín": "Colombia", "medina": "Saudi Arabia", "meerut": "India",
  "meherpur": "Bangladesh", "meiktila": "Myanmar", "mekelle": "Ethiopia", "melbourne": "Australia", "memphis": "USA",
  "mendoza": "Argentina", "mergui": "Myanmar", "merida": "Mexico", "mersin": "Turkey", "mesa": "USA",
  "mexicali": "Mexico", "mexico": "Mexico", "mexico city": "Mexico", "miami": "USA", "milan": "Italy",
  "milan city": "Italy", "milwaukee": "USA", "mindelo": "Cabo Verde", "minneapolis": "USA", "minsk": "Belarus",
  "mirissa": "Sri Lanka", "mirpur": "Bangladesh", "miskolc": "Hungary", "misrata": "Libya", "mississauga": "Canada",
  "mogadishu": "Somalia", "mogilev": "Belarus", "mombasa": "Kenya", "monaragala": "Sri Lanka", "monastir": "Tunisia",
  "mongar": "Bhutan", "monrovia": "Liberia", "monte carlo": "Monaco", "monterrey": "Mexico", "montevideo": "Uruguay",
  "montpellier": "France", "montreal": "Canada", "monywa": "Myanmar", "mopti": "Mali", "morocco": "Morocco",
  "moroni": "Comoros", "moscow": "Russia", "moshi": "Tanzania", "mostar": "Bosnia and Herzegovina", "mosul": "Iraq",
  "moulmein": "Myanmar", "moundou": "Chad", "mozambique": "Mozambique", "mukalla": "Yemen",
  "mullaitivu": "Sri Lanka", "multan": "Pakistan", "mumbai": "India", "munich": "Germany",
  "munshiganj": "Bangladesh", "muntinlupa": "Philippines", "murcia": "Spain", "muscat": "Oman", "mutare": "Zimbabwe",
  "mutsamudu": "Comoros", "mwanza": "Tanzania", "myanmar": "Myanmar", "myeik": "Myanmar", "myingyan": "Myanmar",
  "myitkyina": "Myanmar", "mymensingh": "Bangladesh", "mysore": "India", "mysuru": "India", "mzuzu": "Malawi",
  "málaga": "Spain", "n'djamena": "Chad", "nablus": "Palestine", "nacala": "Mozambique", "nadi": "Fiji",
  "naga": "Philippines", "nagoya": "Japan", "nagpur": "India", "nairobi": "Kenya", "najaf": "Iraq",
  "nakhon ratchasima": "Thailand", "nakuru": "Kenya", "namangan": "Uzbekistan", "nampula": "Mozambique",
  "namur": "Belgium", "nanjing": "China", "nantes": "France", "naples": "Italy", "narayanganj": "Bangladesh",
  "narayanghat": "Nepal", "narsingdi": "Bangladesh", "nashik": "India", "nashville": "USA", "nassau": "Bahamas",
  "natal": "Brazil", "natore": "Bangladesh", "navotas": "Philippines", "nawabganj": "Bangladesh",
  "nay pyi taw": "Myanmar", "naypyidaw": "Myanmar", "ndjamena": "Chad", "ndola": "Zambia", "negombo": "Sri Lanka",
  "nelspruit": "South Africa", "nepal": "Nepal", "nepalgunj": "Nepal", "netanya": "Israel",
  "netherlands": "Netherlands", "netrokona": "Bangladesh", "new delhi": "India", "new jersey": "USA",
  "new york": "USA", "new york city": "USA", "new zealand": "New Zealand", "newcastle": "UK",
  "newcastle au": "Australia", "ngerulmud": "Palau", "ngozi": "Burundi", "nha trang": "Vietnam", "niamey": "Niger",
  "nice": "France", "nicosia": "Cyprus", "niger": "Niger", "nigeria": "Nigeria", "niksic": "Montenegro",
  "north carolina": "USA",
  "nikšić": "Montenegro", "ningbo": "China", "nis": "Serbia", "nizhny novgorod": "Russia", "niš": "Serbia",
  "noakhali": "Bangladesh", "noida": "India", "norway": "Norway", "nottingham": "UK", "nouakchott": "Mauritania",
  "noumea": "New Caledonia", "nouméa": "New Caledonia", "novi sad": "Serbia", "novosibirsk": "Russia",
  "nuku'alofa": "Tonga", "nukualofa": "Tonga", "nukus": "Uzbekistan", "nur-sultan": "Kazakhstan",
  "nuremberg": "Germany", "nuwara": "Sri Lanka", "nuwara eliya": "Sri Lanka", "nyc": "USA", "nzerekore": "Guinea",
  "nürnberg": "Germany", "odense": "Denmark", "odesa": "Ukraine", "odessa": "Ukraine", "okayama": "Japan",
  "olongapo": "Philippines", "omaha": "USA", "oman": "Oman", "omdurman": "Sudan", "omsk": "Russia",
  "oran": "Algeria", "orebro": "Sweden", "oruro": "Bolivia", "osaka": "Japan", "osh": "Kyrgyzstan",
  "osijek": "Croatia", "oslo": "Norway", "ostrava": "Czech Republic", "ottawa": "Canada",
  "ouagadougou": "Burkina Faso", "oulu": "Finland", "oxford": "UK", "pabna": "Bangladesh", "padova": "Italy",
  "padua": "Italy", "pakistan": "Pakistan", "pakokku": "Myanmar", "pakse": "Laos", "palembang": "Indonesia",
  "palermo": "Italy", "palikir": "Micronesia", "palm jumeirah": "United Arab Emirates", "palma": "Spain",
  "palmerston north": "New Zealand", "panaji": "India", "panama city": "Panama", "paphos": "Cyprus",
  "paraguay": "Paraguay", "parakou": "Benin", "paramaribo": "Suriname", "paranaque": "Philippines",
  "parañaque": "Philippines", "paris": "France", "paro": "Bhutan", "pasay": "Philippines", "pasig": "Philippines",
  "patan": "Nepal", "pathein": "Myanmar", "patna": "India", "patras": "Greece", "pattaya": "Thailand",
  "patuakhali": "Bangladesh", "pavlodar": "Kazakhstan", "pecs": "Hungary", "pegu": "Myanmar",
  "pemagatshel": "Bhutan", "penang": "Malaysia", "perth": "Australia", "peru": "Peru", "peshawar": "Pakistan",
  "petaling jaya": "Malaysia", "petra": "Jordan", "philadelphia": "USA", "philippines": "Philippines",
  "phnom penh": "Cambodia", "phoenix": "USA", "phuentsholing": "Bhutan", "phuket": "Thailand",
  "phuntsholing": "Bhutan", "pilipinas": "Philippines", "pisa": "Italy", "piura": "Peru", "plovdiv": "Bulgaria",
  "plzen": "Czech Republic", "plzeň": "Czech Republic", "podgorica": "Montenegro",
  "pointe-noire": "Republic of Congo", "pokhara": "Nepal", "poland": "Poland", "polokwane": "South Africa",
  "polonnaruwa": "Sri Lanka", "port elizabeth": "South Africa", "port harcourt": "Nigeria",
  "port louis": "Mauritius", "port moresby": "Papua New Guinea", "port of spain": "Trinidad and Tobago",
  "port said": "Egypt", "port sudan": "Sudan", "port vila": "Vanuatu", "port-au-prince": "Haiti",
  "port-gentil": "Gabon", "portland": "USA", "porto": "Portugal", "porto alegre": "Brazil", "porto-novo": "Benin",
  "poznan": "Poland", "poznań": "Poland", "prague": "Czech Republic", "praia": "Cabo Verde", "praslin": "Seychelles",
  "pretoria": "South Africa", "prishtina": "Kosovo", "pristina": "Kosovo", "prizren": "Kosovo", "prome": "Myanmar",
  "puchong": "Malaysia", "puebla": "Mexico", "punakha": "Bhutan", "pune": "India", "putrajaya": "Malaysia",
  "puttalam": "Sri Lanka", "puttaparthi": "Sri Lanka", "pyay": "Myanmar", "pyin oo lwin": "Myanmar",
  "pyongyang": "North Korea", "pécs": "Hungary", "qalqilya": "Palestine", "qatar": "Qatar", "qingdao": "China",
  "qom": "Iran", "quatre bornes": "Mauritius", "quebec city": "Canada", "quelimane": "Mozambique",
  "quetta": "Pakistan", "quezon city": "Philippines", "quito": "Ecuador", "rabat": "Morocco", "raipur": "India",
  "rajkot": "India", "rajshahi": "Bangladesh", "raleigh": "USA", "ramallah": "Palestine", "ranchi": "India",
  "randers": "Denmark", "rangoon": "Myanmar", "rangpur": "Bangladesh", "raqqa": "Syria",
  "ras al khaimah": "United Arab Emirates", "rasht": "Iran", "ratnapura": "Sri Lanka", "rawalpindi": "Pakistan",
  "reading": "UK", "recife": "Brazil", "regina": "Canada", "rennes": "France", "reykjavik": "Iceland",
  "rhodes": "Greece", "riga": "Latvia", "rijeka": "Croatia", "rio": "Brazil", "rio de janeiro": "Brazil",
  "rishon lezion": "Israel", "riyadh": "Saudi Arabia", "rome": "Italy", "rosario": "Argentina",
  "rose hill": "Mauritius", "roseau": "Dominica", "rostov": "Russia", "rotterdam": "Netherlands", "rundu": "Namibia",
  "russia": "Russia", "rustavi": "Georgia", "rwanda": "Rwanda", "sacramento": "USA", "sagaing": "Myanmar",
  "saidpur": "Bangladesh", "saint georges": "Grenada", "saint johns": "Antigua and Barbuda",
  "saint petersburg": "Russia", "saint-louis": "Senegal", "sakai": "Japan", "salalah": "Oman", "salvador": "Brazil",
  "salzburg": "Austria", "samara": "Russia", "samarinda": "Indonesia", "samarkand": "Uzbekistan",
  "samdrup jongkhar": "Bhutan", "san diego": "USA", "san francisco": "USA", "san jose": "Costa Rica",
  "san jose ca": "USA", "san josé": "Costa Rica", "san marino": "San Marino", "san pedro ic": "Ivory Coast",
  "san pedro sula": "Honduras", "san salvador": "El Salvador", "sana'a": "Yemen", "sanaa": "Yemen",
  "sandton": "South Africa", "santa cruz": "Bolivia", "santiago": "Chile", "santo domingo": "Dominican Republic",
  "sao paulo": "Brazil", "sao tome": "Sao Tome and Principe", "sao tome city": "Sao Tome and Principe",
  "sapporo": "Japan", "sarajevo": "Bosnia and Herzegovina", "sarh": "Chad", "sarpang": "Bhutan",
  "saskatoon": "Canada", "satkhira": "Bangladesh", "saudi arabia": "Saudi Arabia", "savannakhet": "Laos",
  "seattle": "USA", "sekondi": "Ghana", "semarang": "Indonesia", "sendai": "Japan", "senegal": "Senegal",
  "seoul": "South Korea", "serekunda": "Gambia", "seria": "Brunei", "seville": "Spain", "sf": "USA",
  "south carolina": "USA",
  "sfax": "Tunisia", "shah alam": "Malaysia", "shanghai": "China", "shariatpur": "Bangladesh",
  "sharjah": "United Arab Emirates", "sharm el sheikh": "Egypt", "sheffield": "UK", "shenzhen": "China",
  "shiraz": "Iran", "shwebo": "Myanmar", "shymkent": "Kazakhstan", "sialkot": "Pakistan", "siddharthanagar": "Nepal",
  "sidon": "Lebanon", "siem reap": "Cambodia", "siena": "Italy", "sigiriya": "Sri Lanka",
  "sihanoukville": "Cambodia", "silicon valley": "USA", "sing": "Singapore", "singapore": "Singapore",
  "singapur": "Singapore", "sirajganj": "Bangladesh", "sirte": "Libya", "sittwe": "Myanmar",
  "skopje": "North Macedonia", "sofia": "Bulgaria", "sohar": "Oman", "sokode": "Togo", "somalia": "Somalia",
  "sousse": "Tunisia", "south africa": "South Africa", "south korea": "South Korea", "southampton": "UK",
  "soweto": "South Africa", "spain": "Spain", "split": "Croatia", "sri jayawardenepura kotte": "Sri Lanka",
  "sri lanka": "Sri Lanka", "srinagar": "India", "st. george's": "Grenada", "st. john's": "Antigua and Barbuda",
  "st. petersburg": "Russia", "st. pölten": "Austria", "stara zagora": "Bulgaria", "stavanger": "Norway",
  "stockholm": "Sweden", "stoke-on-trent": "UK", "strasbourg": "France", "stuttgart": "Germany",
  "subang jaya": "Malaysia", "sucre": "Bolivia", "sudan": "Sudan", "sulaymaniyah": "Iraq", "sumgayit": "Azerbaijan",
  "sunshine coast": "Australia", "surabaya": "Indonesia", "surat": "India", "suriname": "Suriname",
  "surrey": "Canada", "suva": "Fiji", "suwon": "South Korea", "suzhou": "China", "swakopmund": "Namibia",
  "swansea": "UK", "sweden": "Sweden", "switzerland": "Switzerland", "sydney": "Australia", "sylhet": "Bangladesh",
  "syria": "Syria", "szczecin": "Poland", "são paulo": "Brazil", "são tomé": "Sao Tome and Principe",
  "tabriz": "Iran", "tabuk": "Saudi Arabia", "tacloban": "Philippines", "taguig": "Philippines",
  "taichung": "Taiwan", "taif": "Saudi Arabia", "tainan": "Taiwan", "taipei": "Taiwan", "taiwan": "Taiwan",
  "taiz": "Yemen", "takoradi": "Ghana", "tallinn": "Estonia", "tamale": "Ghana", "tampere": "Finland",
  "tangail": "Bangladesh", "tangerang": "Indonesia", "tansen": "Nepal", "tanzania": "Tanzania", "tarawa": "Kiribati",
  "tartu": "Estonia", "tashigang": "Bhutan", "tashkent": "Uzbekistan", "taunggyi": "Myanmar", "taungoo": "Myanmar",
  "tauranga": "New Zealand", "tavoy": "Myanmar", "tbilisi": "Georgia", "tegucigalpa": "Honduras", "tehran": "Iran",
  "tel aviv": "Israel", "tel-aviv": "Israel", "temuco": "Chile", "tete": "Mozambique", "teyateyaneng": "Lesotho",
  "thailand": "Thailand", "thaton": "Myanmar", "the hague": "Netherlands", "thessaloniki": "Greece",
  "thies": "Senegal", "thika": "Kenya", "thimphu": "Bhutan", "thimpu": "Bhutan", "thiruvananthapuram": "India",
  "tianjin": "China", "tijuana": "Mexico", "tilburg": "Netherlands", "timbuktu": "Mali", "timisoara": "Romania",
  "tirana": "Albania", "tiranë": "Albania", "tiraspol": "Moldova", "tlemcen": "Algeria", "toamasina": "Madagascar",
  "tobruk": "Libya", "tokyo": "Japan", "toliara": "Madagascar", "tombouctou": "Mali", "tondo": "Philippines",
  "tongi": "Bangladesh", "toronto": "Canada", "toulouse": "France", "toungoo": "Myanmar", "townsville": "Australia",
  "trabzon": "Turkey", "trashigang": "Bhutan", "trashiyangtse": "Bhutan", "trieste": "Italy", "trinco": "Sri Lanka",
  "trincomalee": "Sri Lanka", "tripoli": "Libya", "tripoli lb": "Lebanon", "tripoli lb2": "Lebanon",
  "trivandrum": "India", "trondheim": "Norway", "trongsa": "Bhutan", "trujillo": "Peru", "tsirang": "Bhutan",
  "tucson": "USA", "tucuman": "Argentina", "tucumán": "Argentina", "tulkarm": "Palestine", "tulsipur": "Nepal",
  "tunis": "Tunisia", "tunisia": "Tunisia", "turin": "Italy", "turkey": "Turkey", "turkmenabat": "Turkmenistan",
  "turkmenbashi": "Turkmenistan", "turku": "Finland", "tuxtla": "Mexico", "tuzla": "Bosnia and Herzegovina",
  "tyre": "Lebanon", "uae": "United Arab Emirates", "udon thani": "Thailand", "ufa": "Russia", "uganda": "Uganda",
  "uk": "UK", "ukraine": "Ukraine", "ulaanbaatar": "Mongolia", "ulan bator": "Mongolia", "ulsan": "South Korea",
  "umm al quwain": "United Arab Emirates", "unawatuna": "Sri Lanka", "united kingdom": "UK", "united states": "USA",
  "uppsala": "Sweden", "uruguay": "Uruguay", "us": "USA", "usa": "USA", "utrecht": "Netherlands",
  "vadodara": "India", "vaduz": "Liechtenstein", "valencia": "Spain", "valencia ve": "Venezuela",
  "valenzuela": "Philippines", "valladolid": "Spain", "valletta": "Malta", "valparaiso": "Chile",
  "vanadzor": "Armenia", "vancouver": "Canada", "varanasi": "India", "varna": "Bulgaria", "vatican": "Vatican City",
  "vatican city": "Vatican City", "vavuniya": "Sri Lanka", "venezuela": "Venezuela", "venice": "Italy",
  "veracruz": "Mexico", "verona": "Italy", "victoria": "Seychelles", "victoria bc": "Canada", "vienna": "Austria",
  "vientiane": "Laos", "viet nam": "Vietnam", "vietnam": "Vietnam", "vijayawada": "India", "vilnius": "Lithuania",
  "virginia beach": "USA", "visakhapatnam": "India", "vladivostok": "Russia", "vlorë": "Albania", "volos": "Greece",
  "vung tau": "Vietnam", "wad madani": "Sudan", "waling": "Nepal", "walvis bay": "Namibia", "wangdi": "Bhutan",
  "wangdue phodrang": "Bhutan", "warsaw": "Poland", "washington": "USA", "waterford": "Ireland",
  "weligama": "Sri Lanka", "wellington": "New Zealand", "wenzhou": "China", "windhoek": "Namibia",
  "winnipeg": "Canada", "winterthur": "Switzerland", "wollongong": "Australia", "wolverhampton": "UK",
  "wroclaw": "Poland", "wuhan": "China", "wuxi": "China", "xi'an": "China", "xiamen": "China", "xian": "China",
  "yamoussoukro": "Ivory Coast", "yanbu": "Saudi Arabia", "yangon": "Myanmar", "yaounde": "Cameroon",
  "yaoundé": "Cameroon", "yaren": "Nauru", "yazd": "Iran", "yekaterinburg": "Russia", "yerevan": "Armenia",
  "yogyakarta": "Indonesia", "yokohama": "Japan", "zagreb": "Croatia", "zahedan": "Iran", "zambia": "Zambia",
  "zamboanga": "Philippines", "zanzibar": "Tanzania", "zanzibar city": "Tanzania", "zaporizhzhia": "Ukraine",
  "zaragoza": "Spain", "zaria": "Nigeria", "zarqa": "Jordan", "zhemgang": "Bhutan", "zhengzhou": "China",
  "ziguinchor": "Senegal", "zimbabwe": "Zimbabwe", "zinder": "Niger", "zomba": "Malawi", "zurich": "Switzerland",
  "örebro": "Sweden", "łódź": "Poland",
};

// Small edit-distance helper — catches PMS typos/misspellings (e.g. "Kuala Lampur" for
// "Kuala Lumpur") that exact and substring matching miss. Only used as a last-resort
// fallback, after exact, DA_POLICY, and substring matches have already failed.
function levenshteinDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function fuzzyMatchCityCountry(lower: string): string {
  let best: { dist: number; country: string } | null = null;
  for (const [key, country] of Object.entries(CITY_COUNTRY_MAP)) {
    if (key.length < 4) continue; // skip very short keys — fuzzy-matching them is unreliable
    const dist = levenshteinDistance(lower, key);
    const threshold = Math.max(1, Math.floor(Math.min(lower.length, key.length) * 0.2));
    if (dist <= threshold && (!best || dist < best.dist)) best = { dist, country };
  }
  return best ? best.country : '';
}

function inferCountryFromCity(city: string): string {
  if (!city) return 'India'; // Koenig default — most domestic
  const lower = city.toLowerCase().trim();
  // Direct match
  if (CITY_COUNTRY_MAP[lower]) return CITY_COUNTRY_MAP[lower];
  // Check if the value itself is already a country name in DA_POLICY
  const directCountry = Object.keys(DA_POLICY).find(k => k.toLowerCase() === lower);
  if (directCountry) return directCountry;
  // Partial match — city string contains a known city key
  for (const [key, country] of Object.entries(CITY_COUNTRY_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return country;
  }
  // Fuzzy match — catches PMS typos/misspellings that exact/substring matching miss
  const fuzzy = fuzzyMatchCityCountry(lower);
  if (fuzzy) return fuzzy;
  // Default: assume India for unrecognised cities (most Koenig domestic training)
  return 'India';
}


function mapRawToAssignment(r: RawTrainerAssignment, fallbackFromDate = '', fallbackToDate = ''): Assignment {
  // ── Batch type & delivery mode ──────────────────────────────────────────────
  // apikey=258 (primary) returns "batch_delivery_mode"; apikey=208 (fallback) returns "Batch_type"
  const rawBdm    = pickStr(r, 'batch_delivery_mode', 'BatchDeliveryMode', 'Batch_type');
  const batchType = rawBdm || undefined;
  const deliveryMode = batchType ? deriveDeliveryMode(batchType) : undefined;

  // ── Course & client ─────────────────────────────────────────────────────────
  const courseName  = pickStr(r, 'CourseName', 'course_name') || 'Assignment';
  const clientName  = pickStr(r, 'ClientName', 'client_name');
  const trainerName = pickStr(r, 'TrainerName', 'trainer_name');
  const trainerEmail= pickStr(r, 'TrainerEmail', 'trainer_email');
  const batchId     = pickStr(r, 'BatchId', 'batch_id');
  // apikey=208 new fields
  const manager     = pickStr(r, 'Manager', 'manager', 'manager_name', 'ManagerName');
  const totalPax    = pickStr(r, 'TotalPax', 'total_pax', 'totalPax', 'pax');

  // ── Location ─────────────────────────────────────────────────────────────────
  const city    = pickStr(r, 'city_of_training', 'CityOfTraining', 'City', 'city');
  const rawCountry = pickStr(r, 'Country', 'country', 'CountryName', 'country_name');

  // PMS frequently returns "India" as a default country even for international assignments.
  // City-based inference is authoritative — if city resolves to a non-India country,
  // always use that over the PMS-supplied "India" default.
  // Use case-insensitive, trimmed comparison so 'india', 'India ', 'INDIA' all match.
  const cityInferred   = inferCountryFromCity(city);
  const rawCountryNorm = (rawCountry || '').toLowerCase().trim();
  const country = (cityInferred !== 'India' && (!rawCountryNorm || rawCountryNorm === 'india'))
    ? cityInferred                          // city is clearly international → override PMS India default
    : (rawCountry?.trim() || cityInferred); // PMS has a real non-India country, or city infers India → trust it

  const trainingVenue = pickStr(r,
    'training_venue', 'TrainingVenue', 'Venue', 'venue', 'VenueName', 'venue_name',
    'training_location', 'TrainingLocation', 'Location', 'location',
    'batch_venue', 'BatchVenue', 'training_place', 'TrainingPlace',
  );

  // ── Dates ────────────────────────────────────────────────────────────────────
  // Priority 1: separate start/end date fields (exhaustive Koenig API variant list)
  // Note: apikey=208 returns "StarDate" (typo for StartDate) — must be first
  let startDate = pickDate(r,
    'StarDate', 'start_date', 'StartDate',
    'AssignmentStartDate', 'assignment_start_date',
    'BatchStartDate', 'batch_start_date',
    'TrainingStartDate', 'training_start_date',
    'BatchFromDate', 'batch_from_date',
    'From_Date', 'from_date', 'FromDate',
    'DateFrom', 'date_from',
    'BatchFrom', 'batch_from',
    'AssignmentFrom', 'assignment_from',
  );
  let endDate = pickDate(r,
    'end_date', 'EndDate',
    'AssignmentEndDate', 'assignment_end_date',
    'BatchEndDate', 'batch_end_date',
    'TrainingEndDate', 'training_end_date',
    'BatchToDate', 'batch_to_date',
    'To_Date', 'to_date', 'ToDate',
    'DateTo', 'date_to',
    'BatchTo', 'batch_to',
    'AssignmentTo', 'assignment_to',
  );

  // Priority 2: parse combined training_dates string  e.g. "23-Jul-2026 to 30-Jul-2026"
  const rawTrainingDates = pickStr(r, 'training_dates', 'TrainingDates');
  if (rawTrainingDates) {
    const parsed = parseTrainingDates(rawTrainingDates);
    if (!startDate && parsed.startDate) startDate = parsed.startDate;
    if (!endDate   && parsed.endDate)   endDate   = parsed.endDate;
  }

  // Priority 3: fall back to selected date range (shown as "inferred" in UI)
  if (!startDate && fallbackFromDate) startDate = fallbackFromDate;
  if (!endDate   && fallbackToDate)   endDate   = fallbackToDate;

  // trainingDates = raw API string if present; null = inferred (UI shows amber label)
  const trainingDates: string | null = rawTrainingDates || null;

  // ── New fields from apikey=258 ────────────────────────────────────────────────
  // Try every known field name variant the Koenig PMS may return
  const scidRaw = r.SCID ?? r.scid ?? r.Scid ?? r.batch_scid ?? r.BatchScid ??
                  r.SCID_No ?? r.scid_no ?? r.ScidNo ?? null;
  const scid = scidRaw != null ? String(scidRaw) : undefined;

  const paxRaw = r.NoOfParticipants ?? r.no_of_participants ?? r.participants ??
                 r.Participants ?? r.TotalPax ?? r.total_pax ?? r.pax ?? r.Pax ??
                 r.participant_count ?? r.ParticipantCount ?? null;
  const noOfParticipants = paxRaw != null ? Number(paxRaw) : undefined;

  const startTime = pickStr(r,
    'Start_time', 'start_time', 'StartTime', 'Start_Time',
    'batch_start_time', 'BatchStartTime', 'session_start_time', 'SessionStartTime',
    'training_start_time', 'TrainingStartTime', 'time_from', 'TimeFrom',
  ) || undefined;

  const endTime = pickStr(r,
    'end_time', 'End_time', 'EndTime', 'End_Time',
    'batch_end_time', 'BatchEndTime', 'session_end_time', 'SessionEndTime',
    'training_end_time', 'TrainingEndTime', 'time_to', 'TimeTo',
  ) || undefined;

  return {
    id:            uid(),
    assignmentId:  r.AssignmentId != null ? String(r.AssignmentId) : '',
    batchId,
    courseName,
    clientName,
    city,
    country,
    hotelName:     '',
    venueName:     trainingVenue,
    distanceKm:    '',
    startDate,
    endDate,
    source:        'api',
    trainerName,
    trainerEmail,
    trainingVenue,
    trainingDates,
    manager,
    totalPax,
    batchType,
    batchCategory: undefined,
    deliveryMode,
    scid,
    noOfParticipants,
    startTime,
    endTime,
  } as Assignment;
}

const COUNTRIES = ['India', 'United Arab Emirates', 'Dubai', 'USA', 'UK', 'Singapore', 'Australia', 'Canada', 'Germany', 'Saudi Arabia', 'Qatar', 'Bahrain', 'Kuwait', 'Nepal', 'Bangladesh', 'Sri Lanka', 'Bhutan', 'Myanmar', 'Japan', 'France', 'Italy', 'Switzerland', 'Netherlands', 'Belgium', 'Sweden', 'Spain', 'Portugal', 'Ireland', 'Russia', 'China', 'South Korea', 'Hong Kong', 'Taiwan', 'Thailand', 'Malaysia', 'Indonesia', 'Philippines', 'Vietnam', 'Pakistan', 'Egypt', 'South Africa', 'Kenya', 'Nigeria', 'Ghana', 'Turkey', 'Israel', 'Jordan', 'Oman', 'Yemen', 'Iran', 'Iraq', 'Lebanon', 'New Zealand', 'Mexico', 'Brazil', 'Argentina', 'Colombia', 'Chile', 'Peru'];
const CITIES_IN = ['Delhi', 'Mumbai', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Noida', 'Gurgaon'];

// ── DA Policy table (as per official DA Policy document) ──────────────────────
// currency: 'INR' | 'AED' | 'USD'
// rate: amount in that currency per day

interface DaPolicy { rate: number; currency: string; }

const DA_POLICY: Record<string, DaPolicy> = {
  // India & Neighboring Countries (INR)
  'India': { rate: 950, currency: 'INR' },
  'Nepal': { rate: 1100, currency: 'INR' },
  'Bangladesh': { rate: 1100, currency: 'INR' },
  'Myanmar': { rate: 1100, currency: 'INR' },
  'Burma': { rate: 1100, currency: 'INR' },
  'Bhutan': { rate: 1100, currency: 'INR' },
  'Sri Lanka': { rate: 1100, currency: 'INR' },
  // Dubai / UAE (AED)
  'Dubai': { rate: 75, currency: 'AED' },
  'United Arab Emirates': { rate: 75, currency: 'AED' },
  'UAE': { rate: 75, currency: 'AED' },
  // All international (USD)
  'UK': { rate: 50, currency: 'USD' },
  'Singapore': { rate: 50, currency: 'USD' },
  'Maldives': { rate: 40, currency: 'USD' },
  'USA': { rate: 50, currency: 'USD' },
  'United States': { rate: 50, currency: 'USD' },
  'South Africa': { rate: 40, currency: 'USD' },
  'Australia': { rate: 50, currency: 'USD' },
  'Thailand': { rate: 30, currency: 'USD' },
  'Saudi Arabia': { rate: 30, currency: 'USD' },
  'Malaysia': { rate: 30, currency: 'USD' },
  'Philippines': { rate: 30, currency: 'USD' },
  'Canada': { rate: 50, currency: 'USD' },
  'Egypt': { rate: 25, currency: 'USD' },
  'Denmark': { rate: 50, currency: 'USD' },
  'Namibia': { rate: 30, currency: 'USD' },
  'Indonesia': { rate: 30, currency: 'USD' },
  'Tanzania': { rate: 25, currency: 'USD' },
  'Vietnam': { rate: 20, currency: 'USD' },
  'Kenya': { rate: 25, currency: 'USD' },
  'Sudan': { rate: 25, currency: 'USD' },
  'Zimbabwe': { rate: 30, currency: 'USD' },
  'Laos': { rate: 20, currency: 'USD' },
  'Mexico': { rate: 20, currency: 'USD' },
  'Mozambique': { rate: 25, currency: 'USD' },
  'Djibouti': { rate: 20, currency: 'USD' },
  'Dijbouti': { rate: 20, currency: 'USD' },
  'Burundi': { rate: 20, currency: 'USD' },
  'Ghana': { rate: 30, currency: 'USD' },
  'Kazakhstan': { rate: 30, currency: 'USD' },
  'Iraq': { rate: 40, currency: 'USD' },
  'Ethiopia': { rate: 30, currency: 'USD' },
  'Pakistan': { rate: 20, currency: 'USD' },
  'Oman': { rate: 40, currency: 'USD' },
  'Yemen': { rate: 20, currency: 'USD' },
  'Gabon': { rate: 30, currency: 'USD' },
  'Lebanon': { rate: 20, currency: 'USD' },
  'Mauritius': { rate: 30, currency: 'USD' },
  'Mongolia': { rate: 20, currency: 'USD' },
  'Zambia': { rate: 25, currency: 'USD' },
  'Spain': { rate: 50, currency: 'USD' },
  'Malawi': { rate: 20, currency: 'USD' },
  'Angola': { rate: 30, currency: 'USD' },
  'Iran': { rate: 30, currency: 'USD' },
  'Israel': { rate: 50, currency: 'USD' },
  'Nigeria': { rate: 20, currency: 'USD' },
  'Turkey': { rate: 30, currency: 'USD' },
  'Hong Kong': { rate: 40, currency: 'USD' },
  'New Caledonia': { rate: 30, currency: 'USD' },
  'Rwanda': { rate: 25, currency: 'USD' },
  'East Timor': { rate: 20, currency: 'USD' },
  'Timor-Leste': { rate: 20, currency: 'USD' },
  'Equatorial Guinea': { rate: 20, currency: 'USD' },
  'Seychelles': { rate: 30, currency: 'USD' },
  'Germany': { rate: 50, currency: 'USD' },
  'Cyprus': { rate: 50, currency: 'USD' },
  'Poland': { rate: 40, currency: 'USD' },
  'Georgia': { rate: 40, currency: 'USD' },
  'Kuwait': { rate: 30, currency: 'USD' },
  'Vatican City': { rate: 50, currency: 'USD' },
  'Jordan': { rate: 30, currency: 'USD' },
  'Antigua and Barbuda': { rate: 30, currency: 'USD' },
  'Qatar': { rate: 30, currency: 'USD' },
  'Bahamas': { rate: 30, currency: 'USD' },
  'Cambodia': { rate: 20, currency: 'USD' },
  'Barbados': { rate: 30, currency: 'USD' },
  'Somalia': { rate: 20, currency: 'USD' },
  'Belize': { rate: 30, currency: 'USD' },
  'Senegal': { rate: 25, currency: 'USD' },
  'Costa Rica': { rate: 30, currency: 'USD' },
  'Afghanistan': { rate: 20, currency: 'USD' },
  'Cuba': { rate: 30, currency: 'USD' },
  'New Zealand': { rate: 40, currency: 'USD' },
  'Dominica': { rate: 30, currency: 'USD' },
  'Dominican Republic': { rate: 30, currency: 'USD' },
  'Guatemala': { rate: 30, currency: 'USD' },
  'Uzbekistan': { rate: 30, currency: 'USD' },
  'El Salvador': { rate: 30, currency: 'USD' },
  'Libya': { rate: 20, currency: 'USD' },
  'Grenada': { rate: 30, currency: 'USD' },
  'Azerbaijan': { rate: 30, currency: 'USD' },
  'Papua New Guinea': { rate: 20, currency: 'USD' },
  'Haiti': { rate: 30, currency: 'USD' },
  'Amsterdam': { rate: 50, currency: 'USD' },
  'Honduras': { rate: 30, currency: 'USD' },
  'Syria': { rate: 30, currency: 'USD' },
  'Jamaica': { rate: 30, currency: 'USD' },
  'Gambia': { rate: 30, currency: 'USD' },
  'Nicaragua': { rate: 30, currency: 'USD' },
  'Brunei': { rate: 30, currency: 'USD' },
  'Panama': { rate: 30, currency: 'USD' },
  'Taiwan': { rate: 40, currency: 'USD' },
  'Saint Kitts and Nevis': { rate: 30, currency: 'USD' },
  'Cameroon': { rate: 20, currency: 'USD' },
  'Saint Lucia': { rate: 30, currency: 'USD' },
  'Palestinian Territory': { rate: 20, currency: 'USD' },
  'Palestine': { rate: 30, currency: 'USD' },
  'Saint Vincent and the Grenadines': { rate: 30, currency: 'USD' },
  'Lesotho': { rate: 20, currency: 'USD' },
  'Trinidad and Tobago': { rate: 30, currency: 'USD' },
  'Eswatini': { rate: 25, currency: 'USD' },
  'Fiji': { rate: 30, currency: 'USD' },
  'Ireland': { rate: 40, currency: 'USD' },
  'Kiribati': { rate: 30, currency: 'USD' },
  'Portugal': { rate: 40, currency: 'USD' },
  'Marshall Islands': { rate: 30, currency: 'USD' },
  'Belgium': { rate: 50, currency: 'USD' },
  'Micronesia': { rate: 30, currency: 'USD' },
  'Sweden': { rate: 50, currency: 'USD' },
  'Nauru': { rate: 30, currency: 'USD' },
  'Solomon Islands': { rate: 30, currency: 'USD' },
  'Palau': { rate: 30, currency: 'USD' },
  'Russia': { rate: 40, currency: 'USD' },
  'Samoa': { rate: 30, currency: 'USD' },
  'Italy': { rate: 50, currency: 'USD' },
  'Tonga': { rate: 30, currency: 'USD' },
  'Switzerland': { rate: 50, currency: 'USD' },
  'Tuvalu': { rate: 30, currency: 'USD' },
  'Sierra Leone': { rate: 50, currency: 'USD' },
  'Vanuatu': { rate: 30, currency: 'USD' },
  'Algeria': { rate: 25, currency: 'USD' },
  'Argentina': { rate: 30, currency: 'USD' },
  'Benin': { rate: 20, currency: 'USD' },
  'Bolivia': { rate: 30, currency: 'USD' },
  'Botswana': { rate: 25, currency: 'USD' },
  'Brazil': { rate: 30, currency: 'USD' },
  'Burkina Faso': { rate: 20, currency: 'USD' },
  'Chile': { rate: 30, currency: 'USD' },
  'Cabo Verde': { rate: 20, currency: 'USD' },
  'Cape Verde': { rate: 20, currency: 'USD' },
  'Colombia': { rate: 30, currency: 'USD' },
  'Central African Republic': { rate: 20, currency: 'USD' },
  'Ecuador': { rate: 30, currency: 'USD' },
  'Chad': { rate: 20, currency: 'USD' },
  'Guyana': { rate: 30, currency: 'USD' },
  'Comoros': { rate: 20, currency: 'USD' },
  'Paraguay': { rate: 30, currency: 'USD' },
  'Republic of Congo': { rate: 20, currency: 'USD' },
  'Congo': { rate: 20, currency: 'USD' },
  'Peru': { rate: 30, currency: 'USD' },
  'Democratic Republic of the Congo': { rate: 25, currency: 'USD' },
  'DRC': { rate: 25, currency: 'USD' },
  'Suriname': { rate: 30, currency: 'USD' },
  'Japan': { rate: 40, currency: 'USD' },
  'Uruguay': { rate: 30, currency: 'USD' },
  'Venezuela': { rate: 30, currency: 'USD' },
  'South Korea': { rate: 40, currency: 'USD' },
  'Korea': { rate: 40, currency: 'USD' },
  'North Korea': { rate: 40, currency: 'USD' },
  'Tunisia': { rate: 20, currency: 'USD' },
  'Gibraltar': { rate: 40, currency: 'USD' },
  'China': { rate: 40, currency: 'USD' },
  'Eritrea': { rate: 20, currency: 'USD' },
  'Guinea': { rate: 20, currency: 'USD' },
  'Guinea-Bissau': { rate: 20, currency: 'USD' },
  'Ivory Coast': { rate: 25, currency: 'USD' },
  "Côte d'Ivoire": { rate: 25, currency: 'USD' },
  'Liberia': { rate: 20, currency: 'USD' },
  'Madagascar': { rate: 20, currency: 'USD' },
  'Mali': { rate: 20, currency: 'USD' },
  'Mauritania': { rate: 20, currency: 'USD' },
  'Niger': { rate: 20, currency: 'USD' },
  'Sao Tome and Principe': { rate: 20, currency: 'USD' },
  'Togo': { rate: 20, currency: 'USD' },
  'Armenia': { rate: 30, currency: 'USD' },
  'Kyrgyzstan': { rate: 30, currency: 'USD' },
  'Tajikistan': { rate: 30, currency: 'USD' },
  'Turkmenistan': { rate: 30, currency: 'USD' },
  'Bahrain': { rate: 30, currency: 'USD' },
  // European countries (USD)
  'Albania': { rate: 40, currency: 'USD' },
  'Andorra': { rate: 40, currency: 'USD' },
  'Austria': { rate: 50, currency: 'USD' },
  'Belarus': { rate: 40, currency: 'USD' },
  'Bosnia and Herzegovina': { rate: 40, currency: 'USD' },
  'Bulgaria': { rate: 40, currency: 'USD' },
  'Croatia': { rate: 40, currency: 'USD' },
  'Czech Republic': { rate: 40, currency: 'USD' },
  'Czechia': { rate: 40, currency: 'USD' },
  'Estonia': { rate: 40, currency: 'USD' },
  'Finland': { rate: 50, currency: 'USD' },
  'France': { rate: 50, currency: 'USD' },
  'Greece': { rate: 50, currency: 'USD' },
  'Hungary': { rate: 40, currency: 'USD' },
  'Iceland': { rate: 50, currency: 'USD' },
  'Kosovo': { rate: 40, currency: 'USD' },
  'Latvia': { rate: 50, currency: 'USD' },
  'Liechtenstein': { rate: 50, currency: 'USD' },
  'Lithuania': { rate: 50, currency: 'USD' },
  'Luxembourg': { rate: 50, currency: 'USD' },
  'North Macedonia': { rate: 40, currency: 'USD' },
  'Macedonia': { rate: 40, currency: 'USD' },
  'Moldova': { rate: 40, currency: 'USD' },
  'Monaco': { rate: 50, currency: 'USD' },
  'Montenegro': { rate: 40, currency: 'USD' },
  'Netherlands': { rate: 50, currency: 'USD' },
  'Romania': { rate: 40, currency: 'USD' },
  'San Marino': { rate: 50, currency: 'USD' },
  'Serbia': { rate: 40, currency: 'USD' },
  'Slovakia': { rate: 40, currency: 'USD' },
  'Slovenia': { rate: 40, currency: 'USD' },
  'Ukraine': { rate: 40, currency: 'USD' },
  'Uganda': { rate: 25, currency: 'USD' },
};

// Common country name variants returned by Koenig APIs that differ from DA_POLICY keys
const COUNTRY_ALIASES: Record<string, string> = {
  // UK variants
  'united kingdom': 'UK', 'great britain': 'UK', 'england': 'UK', 'britain': 'UK', 'gb': 'UK',
  'northern ireland': 'UK', 'wales': 'UK', 'scotland': 'UK',
  // USA variants
  'us': 'USA', 'america': 'USA', 'united states of america': 'USA', 'united states': 'USA',
  // UAE variants
  'uae': 'United Arab Emirates', 'emirates': 'United Arab Emirates', 'arab emirates': 'United Arab Emirates',
  // ── Neighboring Countries (DA ₹1100) ─────────────────────────────────────
  // Nepal
  'federal democratic republic of nepal': 'Nepal',
  'kingdom of nepal': 'Nepal', 'np': 'Nepal',
  // Bangladesh
  'peoples republic of bangladesh': 'Bangladesh',
  "people's republic of bangladesh": 'Bangladesh',
  'east pakistan': 'Bangladesh', 'bd': 'Bangladesh',
  // Myanmar / Burma
  'burma': 'Myanmar',
  'republic of the union of myanmar': 'Myanmar',
  'union of myanmar': 'Myanmar',
  'union of burma': 'Myanmar',
  'mm': 'Myanmar',
  // Bhutan
  'kingdom of bhutan': 'Bhutan',
  'druk yul': 'Bhutan',       // Bhutan's name in Dzongkha
  'druk gyalkhap': 'Bhutan',
  'bt': 'Bhutan',
  // Sri Lanka
  'democratic socialist republic of sri lanka': 'Sri Lanka',
  'ceylon': 'Sri Lanka',      // former name still used in some APIs
  'srilanka': 'Sri Lanka',
  'sri-lanka': 'Sri Lanka',
  'lk': 'Sri Lanka',

  // Asia
  'viet nam': 'Vietnam', 'vn': 'Vietnam',
  'republic of korea': 'South Korea', 'korea, south': 'South Korea', 'rok': 'South Korea',
  'dprk': 'North Korea', 'korea, north': 'North Korea',
  'holland': 'Netherlands',
  'czech republic': 'Czechia',
  'ivory coast': "Côte d'Ivoire", "cote d'ivoire": "Côte d'Ivoire", 'cote divoire': "Côte d'Ivoire",
  // Africa
  'dr congo': 'Democratic Republic of the Congo', 'drc': 'Democratic Republic of the Congo',
  'congo, democratic republic': 'Democratic Republic of the Congo',
  'congo, republic': 'Republic of Congo',
  'eswatini': 'Eswatini', 'swaziland': 'Eswatini',
  'cabo verde': 'Cabo Verde', 'cape verde': 'Cabo Verde',
  // Europe
  'north macedonia': 'North Macedonia', 'fyrom': 'North Macedonia',
  'bosnia': 'Bosnia and Herzegovina',
  'slovak republic': 'Slovakia',
  // Americas
  'dominican rep': 'Dominican Republic',
  'st kitts': 'Saint Kitts and Nevis',
  'st lucia': 'Saint Lucia',
  'st vincent': 'Saint Vincent and the Grenadines',
  'trinidad': 'Trinidad and Tobago',
  // Oceania
  'timor leste': 'East Timor', 'east timor': 'East Timor',
  // General
  'kingdom of saudi arabia': 'Saudi Arabia', 'ksa': 'Saudi Arabia',
  'kingdom of bahrain': 'Bahrain',
  'sultanate of oman': 'Oman',
  'state of qatar': 'Qatar',
  'state of kuwait': 'Kuwait',
  'new guinea': 'Papua New Guinea',
};

// Cities in Delhi-NCR where No DA is applicable per travel policy
const DELHI_NCR_CITIES = new Set([
  'delhi', 'new delhi', 'noida', 'greater noida', 'gurgaon', 'gurugram',
  'faridabad', 'ghaziabad', 'manesar', 'bahadurgarh', 'sonipat', 'rohtak',
  'dwarka', 'south delhi', 'north delhi', 'east delhi', 'west delhi',
  'central delhi', 'delhi ncr', 'ncr', 'ncr delhi',
]);

function getDaInfo(country: string, city?: string): DaPolicy & { allowed: boolean } {
  const norm = country.trim();

  // Direct lookup
  if (norm && DA_POLICY[norm]) return { ...DA_POLICY[norm], allowed: true };

  // Case-insensitive lookup
  if (norm) {
    const key = Object.keys(DA_POLICY).find(k => k.toLowerCase() === norm.toLowerCase());
    if (key) return { ...DA_POLICY[key], allowed: true };
  }

  // Common country name variants (e.g. "United Kingdom" → "UK")
  if (norm) {
    const aliasTarget = COUNTRY_ALIASES[norm.toLowerCase()];
    if (aliasTarget && DA_POLICY[aliasTarget]) return { ...DA_POLICY[aliasTarget], allowed: true };
  }

  // Fallback: try city name (handles city-as-key entries like 'Amsterdam', or when city was put in country field)
  if (city) {
    const cityNorm = city.trim();
    if (DA_POLICY[cityNorm]) return { ...DA_POLICY[cityNorm], allowed: true };
    const cityKey = Object.keys(DA_POLICY).find(k => k.toLowerCase() === cityNorm.toLowerCase());
    if (cityKey) return { ...DA_POLICY[cityKey], allowed: true };
    // Infer country from city name and retry
    const inferredCountry = inferCountryFromCity(cityNorm);
    if (inferredCountry && DA_POLICY[inferredCountry]) return { ...DA_POLICY[inferredCountry], allowed: true };
  }

  return { rate: 0, currency: 'USD', allowed: false };
}

function formatDaCurrency(amount: number, currency: string): string {
  if (currency === 'INR') return `₹ ${amount.toLocaleString('en-IN')}`;
  if (currency === 'AED') return `AED ${amount}`;
  return `USD ${amount}`;
}

// ── Location autocomplete (OpenStreetMap Nominatim — no API key needed) ────────

interface LocSuggestion { display_name: string; lat: string; lon: string; }

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Geocode a location string via server-side proxy (avoids Nominatim CORS + User-Agent issues)
async function geocode(q: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const r = await fetch(`/api/turso?type=geo&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.results?.[0]) return { lat: d.results[0].lat, lon: d.results[0].lon };
  } catch { /* ignore */ }
  return null;
}

function LocationAutocomplete({
  value, onChange, onSelect, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (name: string, lat: number, lon: number) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<LocSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleInput(v: string) {
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 3) { setSuggestions([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/turso?type=geo&q=${encodeURIComponent(v)}`);
        const json = await res.json();
        const data: LocSuggestion[] = (json.results || []).map((r: { lat: number; lon: number; display_name: string }) => ({
          display_name: r.display_name, lat: String(r.lat), lon: String(r.lon),
        }));
        setSuggestions(data);
        setOpen(data.length > 0);
      } catch { /* ignore */ }
      setLoading(false);
    }, 350);
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 pr-8"
          placeholder={placeholder ?? 'Search location…'}
          value={value}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {loading && <Loader2 size={13} className="absolute right-2.5 top-2.5 animate-spin text-blue-400" />}
        {!loading && value && (
          <button type="button" onClick={() => { onChange(''); setSuggestions([]); setOpen(false); }}
            className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600">
            <X size={13} />
          </button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-left px-3 py-2.5 text-xs hover:bg-blue-50 border-b border-gray-100 last:border-0 flex items-start gap-2"
              onMouseDown={() => {
                onSelect(s.display_name, parseFloat(s.lat), parseFloat(s.lon));
                onChange(s.display_name);
                setSuggestions([]);
                setOpen(false);
              }}
            >
              <MapPin size={11} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <span className="line-clamp-2 text-gray-700">{s.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Currency list (all major world currencies) ─────────────────────────────────
const CURRENCIES = [
  // Most used first
  { code: 'INR', symbol: '₹',    name: 'Indian Rupee' },
  { code: 'USD', symbol: '$',    name: 'US Dollar' },
  { code: 'EUR', symbol: '€',    name: 'Euro' },
  { code: 'GBP', symbol: '£',    name: 'British Pound' },
  { code: 'AED', symbol: 'AED',  name: 'UAE Dirham' },
  { code: 'SGD', symbol: 'S$',   name: 'Singapore Dollar' },
  { code: 'AUD', symbol: 'A$',   name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$',   name: 'Canadian Dollar' },
  { code: 'JPY', symbol: '¥',    name: 'Japanese Yen' },
  { code: 'SAR', symbol: 'SAR',  name: 'Saudi Riyal' },
  { code: 'QAR', symbol: 'QAR',  name: 'Qatari Riyal' },
  { code: 'KWD', symbol: 'KWD',  name: 'Kuwaiti Dinar' },
  { code: 'BHD', symbol: 'BHD',  name: 'Bahraini Dinar' },
  { code: 'OMR', symbol: 'OMR',  name: 'Omani Rial' },
  { code: 'MYR', symbol: 'RM',   name: 'Malaysian Ringgit' },
  { code: 'THB', symbol: '฿',    name: 'Thai Baht' },
  { code: 'IDR', symbol: 'Rp',   name: 'Indonesian Rupiah' },
  { code: 'PHP', symbol: '₱',    name: 'Philippine Peso' },
  { code: 'VND', symbol: '₫',    name: 'Vietnamese Dong' },
  { code: 'KRW', symbol: '₩',    name: 'South Korean Won' },
  { code: 'CNY', symbol: '¥',    name: 'Chinese Yuan' },
  { code: 'HKD', symbol: 'HK$',  name: 'Hong Kong Dollar' },
  { code: 'TWD', symbol: 'NT$',  name: 'Taiwan Dollar' },
  { code: 'NZD', symbol: 'NZ$',  name: 'New Zealand Dollar' },
  { code: 'CHF', symbol: 'Fr',   name: 'Swiss Franc' },
  { code: 'SEK', symbol: 'kr',   name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr',   name: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr',   name: 'Danish Krone' },
  { code: 'PLN', symbol: 'zł',   name: 'Polish Zloty' },
  { code: 'CZK', symbol: 'Kč',   name: 'Czech Koruna' },
  { code: 'HUF', symbol: 'Ft',   name: 'Hungarian Forint' },
  { code: 'RON', symbol: 'lei',  name: 'Romanian Leu' },
  { code: 'BGN', symbol: 'лв',   name: 'Bulgarian Lev' },
  { code: 'HRK', symbol: 'kn',   name: 'Croatian Kuna' },
  { code: 'RUB', symbol: '₽',    name: 'Russian Ruble' },
  { code: 'UAH', symbol: '₴',    name: 'Ukrainian Hryvnia' },
  { code: 'TRY', symbol: '₺',    name: 'Turkish Lira' },
  { code: 'ILS', symbol: '₪',    name: 'Israeli Shekel' },
  { code: 'EGP', symbol: 'E£',   name: 'Egyptian Pound' },
  { code: 'ZAR', symbol: 'R',    name: 'South African Rand' },
  { code: 'NGN', symbol: '₦',    name: 'Nigerian Naira' },
  { code: 'KES', symbol: 'Ksh',  name: 'Kenyan Shilling' },
  { code: 'GHS', symbol: 'GH₵',  name: 'Ghanaian Cedi' },
  { code: 'MAD', symbol: 'MAD',  name: 'Moroccan Dirham' },
  { code: 'TZS', symbol: 'TSh',  name: 'Tanzanian Shilling' },
  { code: 'BRL', symbol: 'R$',   name: 'Brazilian Real' },
  { code: 'MXN', symbol: 'MX$',  name: 'Mexican Peso' },
  { code: 'ARS', symbol: '$',    name: 'Argentine Peso' },
  { code: 'CLP', symbol: 'CLP$', name: 'Chilean Peso' },
  { code: 'COP', symbol: 'COL$', name: 'Colombian Peso' },
  { code: 'PEN', symbol: 'S/.',  name: 'Peruvian Sol' },
  { code: 'PKR', symbol: '₨',    name: 'Pakistani Rupee' },
  { code: 'BDT', symbol: '৳',    name: 'Bangladeshi Taka' },
  { code: 'LKR', symbol: 'Rs',   name: 'Sri Lankan Rupee' },
  { code: 'NPR', symbol: 'Rs',   name: 'Nepalese Rupee' },
  { code: 'MMK', symbol: 'K',    name: 'Myanmar Kyat' },
  { code: 'KHR', symbol: '៛',    name: 'Cambodian Riel' },
  { code: 'LAK', symbol: '₭',    name: 'Lao Kip' },
  { code: 'MNT', symbol: '₮',    name: 'Mongolian Tugrik' },
  { code: 'JOD', symbol: 'JOD',  name: 'Jordanian Dinar' },
  { code: 'LBP', symbol: 'LBP',  name: 'Lebanese Pound' },
  { code: 'IQD', symbol: 'IQD',  name: 'Iraqi Dinar' },
  { code: 'IRR', symbol: '﷼',    name: 'Iranian Rial' },
  { code: 'AFN', symbol: '؋',    name: 'Afghan Afghani' },
  { code: 'GEL', symbol: '₾',    name: 'Georgian Lari' },
  { code: 'AMD', symbol: '֏',    name: 'Armenian Dram' },
  { code: 'AZN', symbol: '₼',    name: 'Azerbaijani Manat' },
  { code: 'KZT', symbol: '₸',    name: 'Kazakhstani Tenge' },
  { code: 'UZS', symbol: 'сум',  name: 'Uzbekistani Som' },
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface TravelBill {
  id: string;
  date: string;
  journeyType: string;
  travelType: string;
  from: string;
  fromLat?: number;
  fromLon?: number;
  to: string;
  toLat?: number;
  toLon?: number;
  distance: string;
  amount: number;
  currency: string;
  receipt: string;       // filename (display)
  receiptData?: string;  // base64 data URL
  source?: 'pms' | 'manual'; // 'pms' = auto-imported from a booked PMS flight, never manually added
}

/** Read a File as a base64 data URL */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Compress image files using canvas (phone photo 4MB → ~150KB JPEG).
 * PDFs and non-image files are returned as-is via fileToBase64.
 */
async function compressAndEncode(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) return fileToBase64(file);
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1200;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
        else         { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = async () => { URL.revokeObjectURL(objectUrl); resolve(await fileToBase64(file)); };
    img.src = objectUrl;
  });
}

const JOURNEY_TYPES = [
  { value: '', label: '— Select Journey Type —' },
  // Home ↔ Venue
  { value: 'Home → Venue',                label: 'Home → Venue' },
  { value: 'Venue → Home',                label: 'Venue → Home' },
  // Accommodation ↔ Venue
  { value: 'Venue → Accommodation',       label: 'Venue → Accommodation' },
  { value: 'Accommodation → Venue',       label: 'Accommodation → Venue' },
  // Accommodation ↔ Airport
  { value: 'Accommodation → Airport',     label: 'Accommodation → Airport' },
  { value: 'Airport → Accommodation',     label: 'Airport → Accommodation' },
  // Airport ↔ Venue
  { value: 'Airport → Venue',             label: 'Airport → Venue' },
  { value: 'Venue → Airport',             label: 'Venue → Airport' },
  // Home ↔ Airport
  { value: 'Home → Airport',              label: 'Home → Airport' },
  { value: 'Airport → Home',              label: 'Airport → Home' },
  // Accommodation ↔ Home
  { value: 'Accommodation → Home',        label: 'Accommodation → Home' },
  { value: 'Home → Accommodation',        label: 'Home → Accommodation' },
];

// Valid journey types per date position in an assignment
const ALL_JOURNEY_TYPES = [
  'Home → Venue', 'Venue → Home', 'Home → Airport', 'Airport → Home',
  'Home → Accommodation', 'Accommodation → Home', 'Airport → Venue', 'Venue → Airport',
  'Airport → Accommodation', 'Accommodation → Airport', 'Venue → Accommodation', 'Accommodation → Venue',
];
const VALID_JOURNEY_BY_POSITION: Record<string, string[]> = {
  departure:  ALL_JOURNEY_TYPES,
  first:      ALL_JOURNEY_TYPES,
  mid:        ALL_JOURNEY_TYPES,
  last:       ALL_JOURNEY_TYPES,
  returnDay:  ALL_JOURNEY_TYPES,
  singleDay:  ALL_JOURNEY_TYPES,
};

// ── Auto-fill From/To based on journey type ───────────────────────────────────
// Derives suggested from/to location strings from Step 2 (venue), Step 5 (airport),
// Step 6 (accommodation) and the trainer profile (home).
function deriveJourneyLocations(
  journeyType: string,
  date: string,
  assignments: Assignment[],
  lodgingEntries: LodgingEntry[],
  pmsFlights: FlightRecord[],
  pmsDetails: import('../types').PmsEmployeeDetails | null | undefined,
): { from: string; to: string; fromSource: string; toSource: string } {

  // Venue: assignment covering the date, else first assignment
  function getVenue(): { loc: string; src: string } {
    const asgn = date
      ? assignments.find(a => a.startDate && a.endDate && date >= a.startDate && date <= a.endDate)
      : assignments[0];
    if (!asgn) return { loc: '', src: '' };
    const venue = [asgn.trainingVenue || asgn.venueName, asgn.city].filter(Boolean).join(', ');
    return { loc: venue, src: 'Step 2 — Assignment Venue' };
  }

  // Accommodation: lodging entry covering the date, else first entry
  function getAccommodation(): { loc: string; src: string } {
    const entry = date
      ? lodgingEntries.find(l => l.checkIn && l.checkOut && date >= l.checkIn && date <= l.checkOut)
      : lodgingEntries[0];
    if (!entry) return { loc: '', src: '' };
    const loc = [entry.hotelName, entry.city].filter(Boolean).join(', ');
    return { loc, src: 'Step 6 — Accommodation' };
  }

  // Airport: flight on or nearest to the travel date
  // Departing TO airport (Venue/Accom → Airport): use from_city of that outbound flight
  // Arriving FROM airport (Airport → Venue/Accom): use to_city of that inbound flight
  function getAirport(direction: 'arriving' | 'departing'): { loc: string; src: string } {
    if (!pmsFlights.length) return { loc: '', src: '' };
    // Prefer a flight on the exact travel date
    let flight = date ? pmsFlights.find(f => parseDT(f.departure_date) === date) : undefined;
    if (!flight) {
      // Fall back to nearest flight chronologically
      const withDate = pmsFlights.filter(f => parseDT(f.departure_date));
      if (direction === 'arriving') {
        // Arriving: find most recent flight before or on the date
        flight = withDate.filter(f => !date || parseDT(f.departure_date) <= date)
          .sort((a, b) => parseDT(b.departure_date).localeCompare(parseDT(a.departure_date)))[0];
      } else {
        // Departing: find next flight on or after the date
        flight = withDate.filter(f => !date || parseDT(f.departure_date) >= date)
          .sort((a, b) => parseDT(a.departure_date).localeCompare(parseDT(b.departure_date)))[0];
      }
    }
    if (!flight) return { loc: '', src: '' };
    // Arriving at destination airport: to_city; departing from home airport: from_city
    const city = direction === 'arriving' ? flight.to_city : flight.from_city;
    const airline = flight.airlines_name ? ` (${flight.airlines_name})` : '';
    return {
      loc: city ? `${city} Airport${airline}` : '',
      src: 'Step 5 — Flight & Travel Details',
    };
  }

  // Home: from PMS profile city/state
  function getHome(): { loc: string; src: string } {
    if (!pmsDetails) return { loc: '', src: '' };
    const parts = [pmsDetails.city_name, pmsDetails.state_name]
      .filter(v => v && String(v).trim() && String(v).trim().toLowerCase() !== 'null')
      .map(v => String(v!).trim());
    return { loc: parts.join(', '), src: 'Profile — Home City' };
  }

  const venue  = getVenue();
  const accom  = getAccommodation();
  const home   = getHome();

  switch (journeyType) {
    case 'Home → Venue': {
      const airport = getAirport('departing');
      return { from: home.loc, to: venue.loc, fromSource: home.src, toSource: venue.src || airport.src };
    }
    case 'Venue → Home': {
      const airport = getAirport('arriving');
      return { from: venue.loc, to: home.loc, fromSource: venue.src, toSource: home.src || airport.src };
    }
    case 'Venue → Accommodation':
      return { from: venue.loc, to: accom.loc, fromSource: venue.src, toSource: accom.src };
    case 'Accommodation → Venue':
      return { from: accom.loc, to: venue.loc, fromSource: accom.src, toSource: venue.src };
    case 'Accommodation → Airport': {
      const airport = getAirport('departing');
      return { from: accom.loc, to: airport.loc, fromSource: accom.src, toSource: airport.src };
    }
    case 'Airport → Accommodation': {
      const airport = getAirport('arriving');
      return { from: airport.loc, to: accom.loc, fromSource: airport.src, toSource: accom.src };
    }
    case 'Airport → Venue': {
      const airport = getAirport('arriving');
      return { from: airport.loc, to: venue.loc, fromSource: airport.src, toSource: venue.src };
    }
    case 'Venue → Airport': {
      const airport = getAirport('departing');
      return { from: venue.loc, to: airport.loc, fromSource: venue.src, toSource: airport.src };
    }
    case 'Accommodation → Home':
      return { from: accom.loc, to: home.loc, fromSource: accom.src, toSource: home.src };
    case 'Home → Accommodation':
      return { from: home.loc, to: accom.loc, fromSource: home.src, toSource: accom.src };
    case 'Home → Airport': {
      const airport = getAirport('departing');
      return { from: home.loc, to: airport.loc, fromSource: home.src, toSource: airport.src };
    }
    case 'Airport → Home': {
      const airport = getAirport('arriving');
      return { from: airport.loc, to: home.loc, fromSource: airport.src, toSource: home.src };
    }
    default:
      return { from: '', to: '', fromSource: '', toSource: '' };
  }
}

// Trainers exempt from the "date must fall within an assignment range" travel-bill check —
// PMS assignment data has a gap for their claim period, but the user has confirmed the travel
// itself is legitimate. Add employee codes here (without "EMP-" prefix) as needed.
const TRAVEL_BILL_DATE_CHECK_EXEMPT_EMP_CODES = new Set(['2645']); // Dinesh Ghanshyam Tiwari

function validateJourneyType(
  journeyType: string,
  date: string,
  assignments: Assignment[],
  empCode?: string,
): { valid: boolean; blocked: boolean; message: string; dateContext: string } {
  if (!date || !journeyType) return { valid: true, blocked: false, message: '', dateContext: '' };

  if (empCode && TRAVEL_BILL_DATE_CHECK_EXEMPT_EMP_CODES.has(empCode.replace(/^EMP-/i, '').trim())) {
    return { valid: true, blocked: false, message: '✓ Valid (assignment-date check exempted for this trainer)', dateContext: 'exempt' };
  }

  const coreAsgn = assignments.find(
    a => a.startDate && a.endDate && date >= a.startDate && date <= a.endDate,
  );
  // Allow up to 5 days before assignment start (multi-leg international travel, or a trainer
  // arriving several days early and staying locally) and up to 5 days after assignment end
  // (return journey connections, or post-batch holding in the same country before the next
  // leg/assignment — e.g. Ankur Kumar EMP-2485 stayed in Dubai until 19 Jul, 3 days after his
  // 16 Jul batch ended, before an overnight flight to Nairobi).
  const depAsgn = !coreAsgn
    ? assignments
        .filter(a => a.startDate && date >= addDays(a.startDate, -5) && date < a.startDate)
        .sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1))[0] ?? null
    : null;
  const retAsgn = !coreAsgn && !depAsgn
    ? assignments
        .filter(a => a.endDate && date > a.endDate && date <= addDays(a.endDate, 5))
        .sort((a, b) => (b.endDate! > a.endDate! ? 1 : -1))[0] ?? null
    : null;

  if (!coreAsgn && !depAsgn && !retAsgn) {
    return {
      valid: false,
      blocked: true,
      message: 'No assignment covers this date. Travel bills can only be added for dates within an assignment range.',
      dateContext: 'no assignment',
    };
  }

  let position = '';
  if (depAsgn)                                                                          position = 'departure';
  else if (retAsgn)                                                                     position = 'returnDay';
  else if (coreAsgn && coreAsgn.startDate === coreAsgn.endDate)                        position = 'singleDay';
  else if (coreAsgn && date === coreAsgn.startDate)                                    position = 'first';
  else if (coreAsgn && date === coreAsgn.endDate)                                      position = 'last';
  else                                                                                  position = 'mid';

  const dateLabels: Record<string, string> = {
    departure:  'departure day (day before assignment starts)',
    first:      'first day of assignment (arrival)',
    mid:        'mid-assignment day',
    last:       'last day of assignment (departure)',
    returnDay:  'return day (day after assignment ends)',
    singleDay:  'single-day assignment',
  };
  const dateContext = dateLabels[position] ?? position;

  const allowed = VALID_JOURNEY_BY_POSITION[position] ?? [];
  if (!allowed.includes(journeyType)) {
    return {
      valid: false,
      blocked: true,
      message: `"${journeyType}" is not valid for a ${dateContext}. Allowed: ${allowed.filter(j => JOURNEY_TYPES.find(jt => jt.value === j)).join(', ')}.`,
      dateContext,
    };
  }

  return { valid: true, blocked: false, message: `✓ Valid for ${dateContext}`, dateContext };
}

interface MiscExpense {
  id: string;
  expenseType: string;
  date: string;
  amount: number;
  currency: string;
  remarks: string;
  receipt: string;       // filename (display)
  receiptData?: string;  // base64 data URL
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white';
const selectCls = inputCls;

function SectionTitle({ children, badge }: { children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-bold text-blue-700">{children}</h3>
      {badge}
    </div>
  );
}

// ── Add/Edit Assignment Modal ──────────────────────────────────────────────────

interface AssignmentModalProps {
  open: boolean;
  initial?: Partial<Assignment>;
  fromDate: string;
  toDate: string;
  koenigCountries: KoenigCountry[];
  countriesLoading: boolean;
  onSave: (a: Assignment) => void;
  onClose: () => void;
}

function AssignmentModal({ open, initial, fromDate, toDate, koenigCountries, countriesLoading, onSave, onClose }: AssignmentModalProps) {
  const [form, setForm] = useState<Partial<Assignment>>({
    courseName: '', clientName: '', city: '', country: 'India',
    hotelName: '', venueName: '', trainingVenue: '', distanceKm: '',
    startDate: fromDate, endDate: toDate, assignmentId: '',
    batchType: '', batchCategory: '', deliveryMode: '',
    trainerName: '', trainerEmail: '',
    ...initial,
  });

  useEffect(() => {
    setForm({
      courseName: '', clientName: '', city: '', country: 'India',
      hotelName: '', venueName: '', trainingVenue: '', distanceKm: '',
      startDate: fromDate, endDate: toDate, assignmentId: '',
      batchType: '', batchCategory: '', deliveryMode: '',
      trainerName: '', trainerEmail: '',
      ...initial,
    });
  }, [open, initial, fromDate, toDate]);

  if (!open) return null;

  function save() {
    if (!form.courseName && !form.clientName) return;
    onSave({
      id: initial?.id ?? uid(),
      source: initial?.source ?? 'manual',
      courseName: form.courseName || '',
      clientName: form.clientName || '',
      city: form.city || '',
      country: form.country || 'India',
      hotelName: form.hotelName || '',
      venueName: form.venueName || form.trainingVenue || form.city || '',
      trainingVenue: form.trainingVenue || form.venueName || '',
      distanceKm: form.distanceKm || '',
      startDate: form.startDate || fromDate,
      endDate: form.endDate || toDate,
      assignmentId: form.assignmentId || '',
      batchType: form.batchType || '',
      batchCategory: form.batchCategory || '',
      deliveryMode: form.deliveryMode || '',
      trainerName: form.trainerName || '',
      trainerEmail: form.trainerEmail || '',
      manager: form.manager || '',
      totalPax: form.totalPax || '',
    });
    onClose();
  }

  function set(k: keyof Assignment, v: string) {
    setForm(p => ({ ...p, [k]: v }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-gray-800">{initial?.id ? 'Edit Assignment' : 'Add Assignment'}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          {/* Row 1 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Course / Training Name *</label>
              <input className={inputCls} placeholder="e.g. AWS Solutions Architect" value={form.courseName || ''}
                onChange={e => set('courseName', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Client / Company Name</label>
              <input className={inputCls} placeholder="e.g. TCS, Infosys" value={form.clientName || ''}
                onChange={e => set('clientName', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Assignment ID</label>
              <input className={inputCls} placeholder="e.g. KS-2026-001" value={form.assignmentId || ''}
                onChange={e => set('assignmentId', e.target.value)} />
            </div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
              <input type="date" className={inputCls} value={form.startDate || ''} min={fromDate} max={toDate}
                onChange={e => set('startDate', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
              <input type="date" className={inputCls} value={form.endDate || ''} min={form.startDate || fromDate} max={toDate}
                onChange={e => set('endDate', e.target.value)} />
            </div>
          </div>

          {/* Row 3 - Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Country {countriesLoading && <span className="text-blue-400">(loading…)</span>}
              </label>
              <select className={selectCls} value={form.country || 'India'} onChange={e => set('country', e.target.value)}>
                {(koenigCountries.length > 0
                  ? koenigCountries.map(c => c.CountryName!)
                  : COUNTRIES
                ).map(c => (
                  <option key={c} value={c}>
                    {c}{DA_POLICY[c] ? ` — ${DA_POLICY[c].currency === 'INR' ? '₹' : DA_POLICY[c].currency} ${DA_POLICY[c].rate}/day` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
              {form.country === 'India' ? (
                <select className={selectCls} value={form.city || ''} onChange={e => set('city', e.target.value)}>
                  <option value="">Select city</option>
                  {CITIES_IN.map(c => <option key={c}>{c}</option>)}
                </select>
              ) : (
                <input className={inputCls} placeholder="City name" value={form.city || ''} onChange={e => set('city', e.target.value)} />
              )}
            </div>
          </div>

          {/* Row 4 - Venue */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hotel / Accommodation</label>
              <input className={inputCls} placeholder="e.g. Hotel Lemon Tree" value={form.hotelName || ''}
                onChange={e => set('hotelName', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Training Venue</label>
              <input className={inputCls} placeholder="e.g. Koenig Delhi Office" value={form.trainingVenue || ''}
                onChange={e => set('trainingVenue', e.target.value)} />
            </div>
          </div>

          <div className="w-1/2 pr-1.5">
            <label className="block text-xs font-medium text-gray-500 mb-1">Distance (Hotel → Venue)</label>
            <input className={inputCls} placeholder="e.g. 8.5 km" value={form.distanceKm || ''}
              onChange={e => set('distanceKm', e.target.value)} />
          </div>

          {/* Row 5 - Batch Type + Mode */}
          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100 mt-1">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Batch Type</label>
              <select className={selectCls} value={form.batchType || ''} onChange={e => set('batchType', e.target.value)}>
                <option value="">— Select —</option>
                <option value="ILO">ILO — Instructor-Led Online</option>
                <option value="ILT">ILT — Instructor-Led Training (Offline)</option>
                <option value="FMAT">FMAT — Face-to-Face (Offline)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Delivery Mode</label>
              <select className={selectCls} value={form.deliveryMode || ''} onChange={e => set('deliveryMode', e.target.value)}>
                <option value="">— Select —</option>
                <option value="Online">Online</option>
                <option value="Offline">Offline</option>
                <option value="Hybrid">Hybrid</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-100">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={save}
            disabled={!form.courseName && !form.clientName}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg flex items-center gap-2">
            <CheckCircle2 size={14} />
            {initial?.id ? 'Update Assignment' : 'Add Assignment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CreateTADABill({ currentUser }: { currentUser?: User }) {
  const navigate = useNavigate();
  const location = useLocation();

  // HR Admin Check Details proxy — hide submit-related UI
  const isProxyMode = !!(currentUser?.originalRole && currentUser.originalRole !== currentUser.role);

  // Stable draft ID for this wizard session — generated once on mount
  const draftClaimIdRef = useRef(`CLAIM-DRAFT-${Date.now()}`);
  const draftRestoredRef = useRef(false);

  // Edit mode — set when ?edit=claimId is in the URL
  const editClaimIdRef = useRef('');
  const editBillNoRef = useRef('');

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [fetched, setFetched] = useState(false);

  // Live FX rates from open.er-api.com (same mid-market source as XE)
  // rates[cur] = how many `cur` per 1 USD; convert to INR-per-foreign via rates['INR']/rates[cur]
  const [fxRates, setFxRates] = useState<Record<string, number>>({ USD: 84, AED: 22.9, EUR: 91, GBP: 107, SGD: 63 });
  const [fxUpdatedAt, setFxUpdatedAt] = useState('');
  const [fxSource, setFxSource] = useState('');
  useEffect(() => {
    import('../lib/currencyRates').then(({ fetchLiveRates }) => {
      fetchLiveRates().then(usdRates => {
        const inrPerUsd = usdRates['INR'] ?? 84;
        const inrRates: Record<string, number> = {};
        for (const [cur, perUsd] of Object.entries(usdRates)) {
          if (perUsd > 0) inrRates[cur] = parseFloat((inrPerUsd / perUsd).toFixed(4));
        }
        if (Object.keys(inrRates).length > 0) setFxRates(inrRates);
        setFxSource('open.er-api.com (XE mid-market)');
        setFxUpdatedAt(new Date().toISOString());
      }).catch(() => { /* keep fallback */ });
    });
  }, []);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'success' | 'empty' | 'error'>('idle');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [allNearbyAssignments, setAllNearbyAssignments] = useState<Assignment[]>([]);
  const [filterBatchType, setFilterBatchType] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | undefined>();
  const [showAssignmentTable, setShowAssignmentTable] = useState(true);
  const today = todayISO();

  // Filtered view of assignments for the Step 2 table (does NOT affect DA calc)
  const filteredAssignments = assignments.filter(a => {
    if (filterBatchType && (a.batchType || '') !== filterBatchType) return false;
    if (filterMode && (a.deliveryMode || '') !== filterMode) return false;
    return true;
  });

  // Unique values for filter dropdowns (from loaded assignments)
  const batchTypeOptions = Array.from(new Set(assignments.map(a => a.batchType).filter(Boolean))) as string[];
  const modeOptions      = Array.from(new Set(assignments.map(a => a.deliveryMode).filter(Boolean))) as string[];

  // Travel bills
  const [travelBills, setTravelBills] = useState<TravelBill[]>([]);
  const [travelDraft, setTravelDraft] = useState<Partial<TravelBill>>({
    date: '', journeyType: '', travelType: 'Cab', from: '', to: '', distance: '', amount: 0, currency: 'INR', receipt: '',
  });
  const [aiExtracting, setAiExtracting] = useState(false);
  const [aiExtracted, setAiExtracted] = useState<{ from?: boolean; to?: boolean; amount?: boolean }>({});
  const [distanceCalculating, setDistanceCalculating] = useState(false);
  // Always-fresh ref so geocode callbacks read latest state after debounce
  const travelDraftRef = useRef<Partial<TravelBill>>({});
  useEffect(() => { travelDraftRef.current = travelDraft; });

  // Auto-calculate distance whenever From or To text changes.
  // • If both lat/lon are already known (user picked from autocomplete): handled by onSelect.
  // • Otherwise geocode the missing endpoint(s) via Nominatim, then apply haversine.
  useEffect(() => {
    const from = (travelDraft.from || '').trim();
    const to   = (travelDraft.to   || '').trim();
    if (!from || !to) return;

    // Coords already present and distance set — nothing to do
    if (travelDraft.fromLat != null && travelDraft.fromLon != null &&
        travelDraft.toLat   != null && travelDraft.toLon   != null &&
        travelDraft.distance) return;

    let dead = false;
    const timer = setTimeout(async () => {
      const cur  = travelDraftRef.current;
      const curF = (cur.from || '').trim();
      const curT = (cur.to   || '').trim();
      if (!curF || !curT) return;

      if (!dead) setDistanceCalculating(true);
      try {
        let fLat = cur.fromLat ?? null;
        let fLon = cur.fromLon ?? null;
        let tLat = cur.toLat   ?? null;
        let tLon = cur.toLon   ?? null;

        // Geocode via server proxy — avoids CORS and Nominatim User-Agent requirement
        const [fromGeo, toGeo] = await Promise.all([
          (fLat == null || fLon == null) ? geocode(curF) : Promise.resolve(null),
          (tLat == null || tLon == null) ? geocode(curT) : Promise.resolve(null),
        ]);
        if (!dead && fromGeo) { fLat = fromGeo.lat; fLon = fromGeo.lon; }
        if (!dead && toGeo)   { tLat = toGeo.lat;   tLon = toGeo.lon; }

        if (!dead && fLat != null && fLon != null && tLat != null && tLon != null) {
          const km   = haversineKm(fLat, fLon, tLat, tLon);
          const dist = `${km.toFixed(1)} km`;
          if (!dead) setTravelDraft(p => ({
            ...p,
            fromLat: fLat!, fromLon: fLon!,
            toLat:   tLat!, toLon:   tLon!,
            distance: dist,
          }));
        }
      } catch { /* ignore */ }
      if (!dead) setDistanceCalculating(false);
    }, 700);

    return () => { dead = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelDraft.from, travelDraft.to, travelDraft.fromLat, travelDraft.fromLon, travelDraft.toLat, travelDraft.toLon]);

  // Misc expenses
  const [miscExpenses, setMiscExpenses] = useState<MiscExpense[]>([]);
  const [miscDraft, setMiscDraft] = useState<Partial<MiscExpense>>({
    expenseType: 'Other', date: '', amount: 0, currency: 'INR', remarks: '', receipt: '',
  });

  // Advance taken
  interface AdvanceTaken { id: string; date: string; amount: number; currency: string; purpose: string; reference: string; }
  const [advances, setAdvances] = useState<AdvanceTaken[]>([]);
  const [advanceDraft, setAdvanceDraft] = useState<Partial<AdvanceTaken>>({
    date: '', amount: 0, currency: 'INR', purpose: '', reference: '',
  });

  const [employeeRemarks, setEmployeeRemarks] = useState('');

  // Lodging state
  const [lodgingEntries, setLodgingEntries] = useState<LodgingEntry[]>([]);
  const [lodgingDraft, setLodgingDraft] = useState<Partial<LodgingEntry>>({
    hotelName: '', city: '', roomNo: '', checkIn: fromDate, checkOut: '', nights: 0, ratePerNight: 0, receipt: '', stayType: 'Other',
  });
  const [pmsAccom, setPmsAccom] = useState<AccommodationRecord[]>([]);
  const [accomLoading, setAccomLoading] = useState(false);
  const [accomError, setAccomError] = useState('');
  const [importedAccom, setImportedAccom] = useState<Set<string>>(new Set());

  // Leave dates — trainer-marked leave days within the claim period
  const [leaveDates, setLeaveDates] = useState<Set<string>>(new Set());
  // PMS leave records (api_key=237)
  const [pmsLeaves, setPmsLeaves] = useState<LeaveRecord[]>([]);
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [leavesError, setLeavesError] = useState('');

  // Pull leaves from PMS every time the wizard has a valid date range — on a draft being
  // opened (dates restored), and whenever the range changes — not only when Fetch is
  // clicked, so a leave cancelled in PMS is never left marked from stale state. Skipped when
  // editing a submitted bill. A page load always starts a new session (see App.tsx), so
  // this runs on every login/refresh as soon as a range exists.
  const leaveRefreshSeq = useRef(0);
  useEffect(() => {
    const code = (currentUser?.trainerId ?? '').replace(/^EMP-/i, '').trim();
    if (!code || !fromDate || !toDate || toDate < fromDate || editClaimIdRef.current) return;
    const seq = ++leaveRefreshSeq.current;
    fetchEmployeeLeaves(code, fromDate, toDate)
      .then(all => {
        if (seq !== leaveRefreshSeq.current) return;
        const inRange = leavesInRange(all, fromDate, toDate);
        setPmsLeaves(inRange);
        setLeavesError('');
        setLeaveDates(prev => mergeLeaveDates(prev, inRange, fromDate, toDate, code));
      })
      .catch(err => {
        if (seq !== leaveRefreshSeq.current) return;
        setLeavesError(err instanceof Error ? err.message : 'Could not refresh leave records');
      });
  }, [currentUser?.trainerId, fromDate, toDate]);

  function toggleLeaveDate(iso: string) {
    setLeaveDates(prev => {
      const next = new Set(prev);
      next.has(iso) ? next.delete(iso) : next.add(iso);
      return next;
    });
  }

  // Flight bills state (api_key=256)
  const [pmsFlights, setPmsFlights] = useState<FlightRecord[]>([]);
  const [flightsLoading, setFlightsLoading] = useState(false);
  const [flightsError, setFlightsError] = useState('');
  const [importedTripIds, setImportedTripIds] = useState<Set<string>>(new Set());

  // Country list from apikey=223
  const [koenigCountries, setKoenigCountries] = useState<KoenigCountry[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);

  // Advance list from apikey=259
  const [pmsAdvances, setPmsAdvances] = useState<RawAdvanceRecord[]>([]);
  const [advancesLoading, setAdvancesLoading] = useState(false);
  const [advancesError, setAdvancesError] = useState('');
  const [importedAdvanceIds, setImportedAdvanceIds] = useState<Set<string>>(new Set());

  // Fetch country list once on mount (apikey=223)
  useEffect(() => {
    setCountriesLoading(true);
    fetchCountryList()
      .then(list => setKoenigCountries(list))
      .catch(() => {/* silent — fallback to hardcoded COUNTRIES */})
      .finally(() => setCountriesLoading(false));
  }, []);

  // Reset all PMS data whenever date range changes so stale data never shows
  useEffect(() => {
    setFetched(false);
    setFetchStatus('idle');
    setLeaveDates(new Set());
    setPmsLeaves([]); setLeavesError('');
    setFetchError('');
    setAssignments([]);
    setPmsFlights([]);
    setFlightsError('');
    setImportedTripIds(new Set());
    setPmsAccom([]);
    setAccomError('');
    setImportedAccom(new Set());
    setPmsAdvances([]);
    setAdvancesError('');
    setImportedAdvanceIds(new Set());
  }, [fromDate, toDate]);

  // ── Fetch handler — fires all three APIs in parallel ─────────────────────────

  const handleFetch = useCallback(async () => {
    if (!fromDate || !toDate || toDate < fromDate) return;

    const empCode = (currentUser?.trainerId ?? '').replace(/^EMP-/i, '').trim();

    // Reset everything before fetching
    setFetchLoading(true);
    setFetchError('');
    setFetched(false);
    setFetchStatus('idle');
    setAssignments([]);
    setAllNearbyAssignments([]);
    setPmsFlights([]);    setFlightsError('');    setImportedTripIds(new Set());
    setPmsAccom([]);      setAccomError('');      setImportedAccom(new Set());
    setPmsLeaves([]);     setLeavesError('');
    setPmsAdvances([]);   setAdvancesError('');   setImportedAdvanceIds(new Set());
    setLeaveDates(new Set());
    setFlightsLoading(true);
    setAccomLoading(true);
    setLeavesLoading(true);
    setAdvancesLoading(true);

    // Wider window dates for adjacent-assignment DA country detection (±30 days)
    const wideFrom = new Date(fromDate); wideFrom.setDate(wideFrom.getDate() - 30);
    const wideTo   = new Date(toDate);   wideTo.setDate(wideTo.getDate() + 30);
    const wideFromStr = wideFrom.toISOString().slice(0, 10);
    const wideToStr   = wideTo.toISOString().slice(0, 10);

    // Launch five API calls simultaneously (plus one wider-window fetch for adjacent-assignment context)
    const [assignResult, flightResult, accomResult, leavesResult, advancesResult, nearbyResult] = await Promise.allSettled([
      fetchTrainerAssignments(fromDate, toDate, empCode),
      empCode ? fetchTrainerFlights(empCode, currentUser?.email) : Promise.resolve<FlightRecord[]>([]),
      empCode ? fetchTrainerAccommodation(empCode) : Promise.resolve<AccommodationRecord[]>([]),
      empCode ? fetchEmployeeLeaves(empCode, fromDate, toDate) : Promise.resolve<LeaveRecord[]>([]),
      empCode ? fetchEmployeeAdvances(empCode) : Promise.resolve<RawAdvanceRecord[]>([]),
      empCode ? fetchTrainerAssignments(wideFromStr, wideToStr, empCode) : Promise.resolve<RawTrainerAssignment[]>([]),
    ]);

    // ── Assignments ───────────────────────────────────────────────────────────
    if (assignResult.status === 'fulfilled') {
      const raw = assignResult.value;

      // Helper: extract best available dates from a raw record.
      // Priority order MUST match mapRawToAssignment so filtering and display use the same date.
      function resolveDates(r: RawTrainerAssignment): { startDate: string; endDate: string } {
        let startDate = '';
        let endDate = '';

        // Priority 1: known separate date fields — "StarDate" is apikey=208's typo for StartDate
        startDate = pickDate(r,
          'StarDate', 'start_date', 'StartDate',
          'AssignmentStartDate', 'assignment_start_date',
          'BatchStartDate', 'batch_start_date',
          'TrainingStartDate', 'training_start_date',
          'BatchFromDate', 'batch_from_date',
          'From_Date', 'from_date', 'FromDate',
          'DateFrom', 'date_from',
          'BatchFrom', 'batch_from',
          'AssignmentFrom', 'assignment_from',
        );
        endDate = pickDate(r,
          'end_date', 'EndDate',
          'AssignmentEndDate', 'assignment_end_date',
          'BatchEndDate', 'batch_end_date',
          'TrainingEndDate', 'training_end_date',
          'BatchToDate', 'batch_to_date',
          'To_Date', 'to_date', 'ToDate',
          'DateTo', 'date_to',
          'BatchTo', 'batch_to',
          'AssignmentTo', 'assignment_to',
        );

        // Priority 2: combined training_dates string (e.g. "23-Jul-2026 to 30-Jul-2026")
        if (!startDate || !endDate) {
          const td = (r.training_dates || r.TrainingDates) as string | null;
          if (td) {
            const parsed = parseTrainingDates(td);
            if (!startDate && parsed.startDate) startDate = parsed.startDate;
            if (!endDate   && parsed.endDate)   endDate   = parsed.endDate;
          }
        }

        // Priority 3: keyword scan ALL string fields — catches any unknown API field names
        if (!startDate || !endDate) {
          const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
          for (const [key, val] of Object.entries(r)) {
            if (!val) continue;
            const k   = key.toLowerCase();
            // Skip known combined-date fields (already handled above)
            if (k === 'training_dates' || k === 'trainingdates') continue;
            const strVal = typeof val === 'string' ? val : String(val);
            const parsed = parseApiDate(strVal);
            if (!parsed || !ISO_RE.test(parsed)) continue;
            if (!startDate && (k.includes('start') || k.includes('from') || k.includes('begin')))
              startDate = parsed;
            if (!endDate && (k.includes('end') || k.includes('to') || k.includes('finish') || k.includes('close')))
              endDate = parsed;
          }
        }

        return { startDate, endDate };
      }

      const filtered = raw.filter(r => {
        const { startDate, endDate } = resolveDates(r);
        // If no date info found in any field, exclude — we can't place it in any date range
        if (!startDate && !endDate) return false;
        const s = startDate || fromDate;
        const e = endDate   || toDate;
        // Overlap: assignment must intersect the selected date range
        return s <= toDate && e >= fromDate;
      });

      // Show only FMAT (Offline) and ILT (Offline) batch types in Step 2.
      // ILO (Online) is hidden until further instruction.
      const validBatch = filtered.filter(r => {
        const bdm = (pickStr(r, 'batch_delivery_mode', 'BatchDeliveryMode', 'Batch_type') || '').toUpperCase().trim();
        if (!bdm) return true; // no batch type info — keep and let display show blank
        return bdm === 'FMAT' || bdm.startsWith('FMAT')
          || bdm === 'ILT'  || bdm.startsWith('ILT');
      });

      // Map AFTER filtering — fallback dates only used for display, not for filtering
      const mapped = validBatch.map(r => mapRawToAssignment(r, fromDate, toDate));

      // Cross-reference flights to fill in missing city/country for assignments.
      // If an assignment has no city (blank PMS field), check for an outbound flight
      // departing within startDate-2 to startDate+2. Use its destination city/country.
      const allFlights: FlightRecord[] =
        flightResult.status === 'fulfilled' ? flightResult.value : [];

      const enriched = mapped.map(asgn => {
        // City is present and resolves to India — confirmed domestic assignment, never override.
        if (asgn.city && inferCountryFromCity(asgn.city) === 'India') return asgn;
        const asgnStart = asgn.startDate || fromDate;

        // Find OUTBOUND international flights: departing up to 4 days BEFORE assignment start
        // and AT MOST on the assignment start day. Using asgnStart as the upper bound excludes
        // return flights (e.g. TG 472 Sydney→Bangkok departs AFTER start, so it's excluded).
        const candidateOutFlights = allFlights.filter(f => {
          if (f.Is_cancelled === 'Yes' || f.Is_cancelled === '1' || String(f.Is_cancelled) === '1') return false;
          const fd = parseDT(f.departure_date);
          if (!fd || !(fd >= addDays(asgnStart, -4) && fd <= asgnStart)) return false;
          const destCity = (f.to_city || '').trim();
          const destCountryCheck = destCity ? inferCountryFromCity(destCity) : '';
          return destCountryCheck !== '' && destCountryCheck !== 'India';
        });
        // Pick the FINAL destination leg: a flight whose destination is NOT a departure city
        // of another candidate (i.e. not a stopover/transit city).
        // Example: Delhi→Bangkok→Sydney — Bangkok is a departure city for the Sydney leg,
        // so Sydney is the final leg. PMS might store Bangkok (transit), but Sydney is correct.
        const departureCities = new Set(candidateOutFlights.map(f => (f.from_city || '').trim().toLowerCase()));
        const finalLeg = candidateOutFlights.find(f => !departureCities.has((f.to_city || '').trim().toLowerCase()));
        const outFlight = finalLeg ?? candidateOutFlights[candidateOutFlights.length - 1] ?? null;

        // If PMS already has correct international city/country AND it matches the final flight leg,
        // keep it. But if flights show the trainer transits THROUGH the PMS city to a further
        // destination, force-override with the actual final destination.
        let pmsIsTransit = false;
        if (asgn.city && asgn.country && asgn.country !== 'India') {
          const pmsCityNorm = asgn.city.trim().toLowerCase();
          pmsIsTransit = candidateOutFlights.some(f => (f.from_city || '').trim().toLowerCase() === pmsCityNorm);
          if (!pmsIsTransit) return asgn; // PMS city is the real final destination — keep it
        }
        if (!outFlight) return asgn;
        const toCity    = (outFlight.to_city || '').trim();
        const inferred  = toCity ? inferCountryFromCity(toCity) : '';
        if (!inferred || inferred === 'India') return asgn;
        // When PMS city is a transit stop, force both city and country to the final destination.
        const enrichedCity    = pmsIsTransit ? toCity : (asgn.city || toCity);
        const enrichedCountry = pmsIsTransit ? inferred : ((asgn.country === 'India' || !asgn.country) ? inferred : asgn.country);
        return { ...asgn, city: enrichedCity, country: enrichedCountry };
      });

      // ── Consecutive-assignment enrichment ─────────────────────────────────
      // When a trainer has 2-3 back-to-back assignments at the same destination
      // (e.g. Dubai batch 1 → Dubai batch 2) with no return flight in between,
      // the 2nd/3rd assignment may lack city/country in PMS. Inherit from the
      // previous international assignment if no active return-to-India flight
      // exists between the two assignments.
      const sortedForEnrich = enriched.slice().sort((a, b) =>
        (a.startDate || '') < (b.startDate || '') ? -1 : 1
      );
      const consecutiveEnriched = sortedForEnrich.map((asgn, idx) => {
        // Already resolved to a confirmed international destination → skip
        if (asgn.city && asgn.country && asgn.country !== 'India') return asgn;
        // Confirmed domestic (India city) → skip
        if (asgn.city && inferCountryFromCity(asgn.city) === 'India') return asgn;
        // City alone already gives a confident, non-India answer (e.g. PMS left `country`
        // blank but city_of_training is a real, mappable city) — trust it rather than
        // inheriting a country from an unrelated previous assignment below. The "unrecognized
        // city" fallback inside inferCountryFromCity IS 'India', already excluded above, so
        // anything reaching here that's truthy is a genuine match, not a default guess. Bug
        // fixed 2026-08-21: Courage Tafadzwa Magadu EMP-3705, Asgn #261661 — city_of_training
        // "Porto" (Portugal) with no PMS country field was being overwritten by a previous
        // assignment's country instead of correctly resolving to Portugal.
        if (asgn.city && inferCountryFromCity(asgn.city)) return asgn;
        // ILO (online) assignments — trainer is at home in India, never inherit international country
        if (asgn.deliveryMode === 'Online') return asgn;

        // Is an assignment "confidently" international — either PMS gave a usable country, or
        // its city maps to a real non-India country?
        const isConfidentIntl = (a: typeof asgn) =>
          (!!a.country && a.country !== 'India') ||
          (!!a.city && !!inferCountryFromCity(a.city) && inferCountryFromCity(a.city) !== 'India');
        const resolvedCountryOf = (a: typeof asgn) =>
          (a.country && a.country !== 'India') ? a.country : inferCountryFromCity(a.city || '');

        // Find the closest previous assignment that IS international
        const prevIntl = sortedForEnrich
          .slice(0, idx)
          .filter(a => a.country && a.country !== 'India')
          .sort((a, b) => (b.endDate || '') > (a.endDate || '') ? 1 : -1)[0] ?? null;
        if (prevIntl?.endDate) {
          // Check: is there any active return-to-India flight between prevIntl.endDate and this assignment's start?
          const curStart = asgn.startDate || addDays(prevIntl.endDate, 1);
          const returnToIndia = allFlights.find(f => {
            if (f.Is_cancelled === 'Yes' || f.Is_cancelled === '1' || String(f.Is_cancelled) === '1') return false;
            const fd = parseDT(f.departure_date);
            if (!fd) return false;
            if (fd < prevIntl.endDate! || fd > addDays(curStart, 1)) return false;
            const toC = inferCountryFromCity((f.to_city || '').trim());
            return toC === 'India';
          });
          if (!returnToIndia) {
            // No return flight between the two assignments — trainer stayed at same destination
            return {
              ...asgn,
              city: asgn.city || prevIntl.city || '',
              country: prevIntl.country,
              trainingDates: asgn.trainingDates || (asgn.startDate ? `${asgn.startDate} to ${asgn.endDate || asgn.startDate}` : null),
            };
          }
          return asgn;
        }

        // No usable PREVIOUS assignment to inherit from — e.g. this is the very FIRST assignment
        // chronologically, so there's nothing earlier to check. Look FORWARD instead: does the
        // trainer continue directly into a LATER international assignment at the same
        // destination, with no return-to-India flight in between? If so, inherit from there.
        // Covers a trainer based OUTSIDE India whose very first overseas leg has no PMS city/
        // country AND no outbound flight on file to infer from (nothing to infer from at all,
        // since the "previous" direction has nothing to look at). Bug fixed 2026-09-03: Soumik
        // Das Purkayastha EMP-3639 (based in Paris, France) — Asgn #254663 (20-24 Jul, London)
        // had no city/country from PMS and no outbound flight on file, so it silently defaulted
        // to India unless a LATER assignment happened to occupy array index 0 by coincidence
        // (the primaryCountry fallback). Fetching just this one assignment — a perfectly normal
        // thing for a trainer to do — always defaulted the whole batch to India DA.
        const nextIntl = sortedForEnrich
          .slice(idx + 1)
          .filter(isConfidentIntl)
          .sort((a, b) => (a.startDate || '') < (b.startDate || '') ? -1 : 1)[0] ?? null;
        if (!nextIntl?.startDate) return asgn;
        const curEnd = asgn.endDate || asgn.startDate;
        if (!curEnd) return asgn;
        const returnToIndiaBefore = allFlights.find(f => {
          if (f.Is_cancelled === 'Yes' || f.Is_cancelled === '1' || String(f.Is_cancelled) === '1') return false;
          const fd = parseDT(f.departure_date);
          if (!fd) return false;
          if (fd < curEnd || fd > nextIntl.startDate!) return false;
          const toC = inferCountryFromCity((f.to_city || '').trim());
          return toC === 'India';
        });
        if (returnToIndiaBefore) return asgn;
        return {
          ...asgn,
          city: asgn.city || nextIntl.city || '',
          country: resolvedCountryOf(nextIntl),
          trainingDates: asgn.trainingDates || (asgn.startDate ? `${asgn.startDate} to ${asgn.endDate || asgn.startDate}` : null),
        };
      });

      setAssignments(consecutiveEnriched);
      setFetchStatus(enriched.length > 0 ? 'success' : 'empty');
    } else {
      const msg = (assignResult.reason as Error)?.message || 'Assignment fetch failed';
      setFetchError(msg);
      setFetchStatus('error');
    }

    // ── Nearby Assignments (wider window for adjacent-assignment DA context) ──
    // Apply the SAME consecutive enrichment so prevAsgn/nextAsgn checks on travel days
    // correctly see the inherited country for assignments without PMS city data.
    if (nearbyResult.status === 'fulfilled') {
      const nearbyMapped = nearbyResult.value.map(r => mapRawToAssignment(r, wideFromStr, wideToStr));
      const availableFlights = flightResult.status === 'fulfilled' ? flightResult.value : [];
      const activeAvailableFlights = availableFlights.filter(f => f.Is_cancelled !== 'Yes' && f.Is_cancelled !== '1' && String(f.Is_cancelled) !== '1');
      const nearbyFlight1Pass = nearbyMapped.map(asgn => {
        if (asgn.city && inferCountryFromCity(asgn.city) === 'India') return asgn;
        if (asgn.deliveryMode === 'Online') return asgn;
        const asgnStart = asgn.startDate || fromDate;
        const candidateNearby = activeAvailableFlights.filter(f => {
          const fd = parseDT(f.departure_date);
          if (!fd || !(fd >= addDays(asgnStart, -4) && fd <= asgnStart)) return false;
          const dc = inferCountryFromCity((f.to_city || '').trim());
          return dc !== '' && dc !== 'India';
        });
        const nearbyDepCities = new Set(candidateNearby.map(f => (f.from_city || '').trim().toLowerCase()));
        const nearbyFinalLeg = candidateNearby.find(f => !nearbyDepCities.has((f.to_city || '').trim().toLowerCase()));
        const outFlight = nearbyFinalLeg ?? candidateNearby[candidateNearby.length - 1] ?? null;
        let nearbyIsTransit = false;
        if (asgn.city && asgn.country && asgn.country !== 'India') {
          const pmsCityNorm = asgn.city.trim().toLowerCase();
          nearbyIsTransit = candidateNearby.some(f => (f.from_city || '').trim().toLowerCase() === pmsCityNorm);
          if (!nearbyIsTransit) return asgn;
        }
        if (!outFlight) return asgn;
        const toCity = (outFlight.to_city || '').trim();
        const inferred = toCity ? inferCountryFromCity(toCity) : '';
        if (!inferred || inferred === 'India') return asgn;
        const nCity    = nearbyIsTransit ? toCity : (asgn.city || toCity);
        const nCountry = nearbyIsTransit ? inferred : ((asgn.country === 'India' || !asgn.country) ? inferred : asgn.country);
        return { ...asgn, city: nCity, country: nCountry };
      });
      const nearbyByDate = nearbyFlight1Pass.slice().sort((a, b) => (a.startDate || '') < (b.startDate || '') ? -1 : 1);
      const nearbyEnriched = nearbyByDate.map((asgn, idx) => {
        if (asgn.city && asgn.country && asgn.country !== 'India') return asgn;
        if (asgn.city && inferCountryFromCity(asgn.city) === 'India') return asgn;
        if (asgn.deliveryMode === 'Online') return asgn; // ILO = trainer at home (India)
        const prevIntl = nearbyByDate.slice(0, idx).filter(a => a.country && a.country !== 'India')
          .sort((a, b) => (b.endDate || '') > (a.endDate || '') ? 1 : -1)[0] ?? null;
        if (!prevIntl?.endDate) return asgn;
        const curStart = asgn.startDate || addDays(prevIntl.endDate, 1);
        const returnToIndia = activeAvailableFlights.find(f => {
          const fd = parseDT(f.departure_date);
          if (!fd || fd < prevIntl.endDate! || fd > addDays(curStart, 1)) return false;
          return inferCountryFromCity((f.to_city || '').trim()) === 'India';
        });
        if (returnToIndia) return asgn;
        return { ...asgn, city: asgn.city || prevIntl.city || '', country: prevIntl.country,
          trainingDates: asgn.trainingDates || (asgn.startDate ? `${asgn.startDate} to ${asgn.endDate || asgn.startDate}` : null) };
      });
      setAllNearbyAssignments(nearbyEnriched);
    }

    // ── Flights ───────────────────────────────────────────────────────────────
    if (flightResult.status === 'fulfilled') {
      const all = flightResult.value;
      // Keep only flights whose departure_date falls within [fromDate, toDate]
      // Include cancelled flights so user can see them (styled differently)
      const inRange = all.filter(f => {
        const dep = parseDT(f.departure_date);
        if (!dep) return false;
        return dep >= fromDate && dep <= toDate;
      });
      // Sort oldest → newest by departure date
      inRange.sort((a, b) => parseDT(a.departure_date).localeCompare(parseDT(b.departure_date)));
      setPmsFlights(inRange);
      if (all.length > 0 && inRange.length === 0) {
        setFlightsError(`${all.length} travel record(s) found in PMS but none depart within ${fmt(fromDate)} → ${fmt(toDate)}.`);
      }
    } else {
      const msg = (flightResult.reason as Error)?.message || 'Could not fetch flights';
      setFlightsError(msg);
    }

    // ── Accommodation ─────────────────────────────────────────────────────────
    if (accomResult.status === 'fulfilled') {
      const all = accomResult.value;
      // Keep only stays whose check-in date falls within [fromDate, toDate]
      const inRange = all.filter(r => {
        const ci = accomDT(r.CheckInDate);
        if (!ci) return false; // no parseable check-in — skip
        return ci >= fromDate && ci <= toDate;
      });
      // Sort oldest → newest by check-in date
      inRange.sort((a, b) => accomDT(a.CheckInDate).localeCompare(accomDT(b.CheckInDate)));
      setPmsAccom(inRange);
      if (all.length > 0 && inRange.length === 0) {
        setAccomError(`${all.length} stay(s) found in PMS but none have check-in within ${fmt(fromDate)} → ${fmt(toDate)}.`);
      }
    } else {
      const msg = (accomResult.reason as Error)?.message || 'Could not fetch accommodation';
      setAccomError(msg);
    }

    // ── Leaves (api_key=237) ──────────────────────────────────────────────────
    if (leavesResult.status === 'fulfilled') {
      const overrideEmpCode = (currentUser?.trainerId ?? '').replace(/^EMP-/i, '').trim();
      const inRange = leavesInRange(leavesResult.value, fromDate, toDate);
      setPmsLeaves(inRange);
      setLeaveDates(prev => mergeLeaveDates(prev, inRange, fromDate, toDate, overrideEmpCode));
    } else {
      const err = leavesResult.reason as Error;
      const msg = err?.message || 'Could not fetch leave records';
      // Surface HTTP errors clearly; silently ignore "no data" non-errors
      if (!msg.toLowerCase().includes('no record') && !msg.toLowerCase().includes('not found')) {
        setLeavesError(msg);
      }
    }

    // ── Advances (apikey=259) ─────────────────────────────────────────────────
    if (advancesResult.status === 'fulfilled') {
      const all = advancesResult.value;
      // Window: 90 days before selected fromDate → toDate
      // Captures advances taken before the trip as well as during it
      const rangeStart = new Date(fromDate);
      rangeStart.setDate(rangeStart.getDate() - 90);
      const effectiveFrom = rangeStart.toISOString().slice(0, 10);
      const effectiveTo   = toDate;
      const inRange = all.filter(r => {
        const d = parseDT(r.Date);
        if (!d) return false;
        return d >= effectiveFrom && d <= effectiveTo;
      });
      // Sort oldest → newest
      inRange.sort((a, b) => {
        const da = parseDT(a.Date) || '';
        const db = parseDT(b.Date) || '';
        return da.localeCompare(db);
      });
      setPmsAdvances(inRange);
      if (all.length > 0 && inRange.length === 0) {
        setAdvancesError(`${all.length} advance record(s) found in PMS but none fall within 90 days before the selected range.`);
      }
    } else {
      const msg = (advancesResult.reason as Error)?.message || 'Could not fetch advance records';
      if (!msg.toLowerCase().includes('no record') && !msg.toLowerCase().includes('not found')) {
        setAdvancesError(msg);
      }
    }

    setFetched(true);
    setFetchLoading(false);
    setFlightsLoading(false);
    setAccomLoading(false);
    setLeavesLoading(false);
    setAdvancesLoading(false);
  }, [fromDate, toDate, currentUser]);

  // ── Derived data ──────────────────────────────────────────────────────────────

  const primaryCountry = assignments[0]?.country || 'India';

  const assignmentDates = useMemo(() => {
    if (!fetched || !fromDate || !toDate) return [];
    return isoRange(fromDate, toDate);
  }, [fetched, fromDate, toDate]);

  // ── Layover DA: find the country with the longest 4+ hour layover on a travel day ──
  // Takes all flights on a given date, sorts by departure time, pairs consecutive flights,
  // computes layover duration at each intermediate city, and returns the layover country
  // (mapped via inferCountryFromCity) if any layover is ≥ 4 hours in a non-India country.
  const getLayoverCountry = useMemo(() => {
    return (travelDate: string): { country: string; layoverHours: number } | null => {
      // All flights departing on this date, sorted by departure time
      const dayFlights = pmsFlights
        .filter(f => parseDT(f.departure_date) === travelDate && f.Is_cancelled !== 'Yes')
        .sort((a, b) => (a.departure_time || '').localeCompare(b.departure_time || ''));

      if (dayFlights.length < 2) return null; // no connections → no layover

      let best: { country: string; layoverHours: number } | null = null;

      for (let i = 0; i < dayFlights.length - 1; i++) {
        const leg1 = dayFlights[i];
        const leg2 = dayFlights[i + 1];

        // Arrival of leg1 (may be on arrival_date which could be same day or next day)
        const arr1Date = parseDT(leg1.arrival_date) || travelDate;
        const arr1Time = (leg1.arrival_time || '').substring(0, 5); // "HH:MM"
        // Departure of leg2
        const dep2Date = parseDT(leg2.departure_date) || travelDate;
        const dep2Time = (leg2.departure_time || '').substring(0, 5);

        if (!arr1Time || !dep2Time) continue;

        // Convert to total minutes from midnight for comparison
        const toMins = (hhmm: string) => {
          const [h, m] = hhmm.split(':').map(Number);
          return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
        };
        const arr1Mins = toMins(arr1Time) + (arr1Date > travelDate ? 1440 : 0); // +1 day = +1440 min
        const dep2Mins = toMins(dep2Time) + (dep2Date > travelDate ? 1440 : 0);
        const layoverMins = dep2Mins - arr1Mins;
        const layoverHours = layoverMins / 60;

        if (layoverHours < 4) continue; // less than 4 hours — skip

        // Intermediate country: where leg1 lands (to_city of leg1)
        const layoverCity    = (leg1.to_city || '').trim();
        const layoverCountry = inferCountryFromCity(layoverCity);

        if (!layoverCountry || layoverCountry === 'India') continue; // domestic stopover

        // Keep the longest qualifying layover
        if (!best || layoverHours > best.layoverHours) {
          best = { country: layoverCountry, layoverHours };
        }
      }

      return best;
    };
  }, [pmsFlights]);

  const daRows = useMemo(() => {
    if (!fetched || !fromDate || !toDate) return [];

    // Only consider active (non-cancelled) flights for all DA calculations
    const activeFlights = pmsFlights.filter(f => f.Is_cancelled !== 'Yes');

    // Resolve effective arrival date for a flight: use arrival_date when present; otherwise
    // infer next-day arrival for late-evening departures (≥ 18:00) where arrival_date is null.
    // This covers TG 471-style overnight legs where the PMS stores null arrival_date.
    const resolveArrDate = (f: typeof activeFlights[0]): string => {
      const raw = (f.arrival_date || '').trim();
      if (raw) return parseDT(raw);
      const depD    = parseDT((f.departure_date || '').trim());
      const depTime = (f.departure_time  || '').substring(0, 5);
      if (depD && depTime && depTime >= '18:00') return addDays(depD, 1);
      return '';
    };

    // Chase forward through same-day connecting legs to find the FINAL arrival — e.g. an
    // international leg landing at a transit city, followed by a domestic connector to the
    // trainer's actual base. Using only the first leg's arrival for "before 12:00"/"same-day
    // India arrival" checks is a bug: Bhavna Singh EMP-3505 flew KL→Chennai (arrives 06:55,
    // before 12:00) then Chennai→Delhi — her actual base — (arrives 13:55, after 12:00). The
    // correct arrival to evaluate is Delhi 13:55, not the Chennai stopover.
    const resolveFinalSameDayLeg = (startFlight: typeof activeFlights[0]): typeof activeFlights[0] => {
      let current = startFlight;
      for (let hop = 0; hop < 5; hop++) {
        const curArrDate = resolveArrDate(current) || parseDT((current.departure_date || '').trim());
        const curArrTime = (current.arrival_time || '').substring(0, 5);
        const curToCity  = (current.to_city || '').trim().toLowerCase();
        const next = activeFlights.find(f => {
          if (f === current) return false;
          const fromCity = (f.from_city || '').trim().toLowerCase();
          const fd = parseDT(f.departure_date);
          const ft = (f.departure_time || '').substring(0, 5);
          return !!fromCity && fromCity === curToCity && fd === curArrDate && ft >= curArrTime;
        });
        if (!next) break;
        current = next;
      }
      return current;
    };

    // ── Flight-aware departure / return day resolution ──────────────────────────
    // Rule: use the actual flight departure_date as the travel day.
    // • If the outbound flight departs the day BEFORE assignment start → that day gets Departure DA
    // • If the outbound flight departs ON assignment start (after-midnight flight) → no extra departure day
    // • If no flight found → fall back to startDate − 1 (default assumption)
    // Same logic applies in reverse for return flights.
    const flightDepDay = new Map<string, string>(); // startDate → actual departure ISO date
    const flightRetDay = new Map<string, string>(); // endDate   → actual return ISO date
    // Tracks which flightRetDay entries were set via the "no flight found, assume end+1"
    // fallback (as opposed to an actually-detected flight) — the wider flight-based return-day
    // supplement below is allowed to override ONLY these fallback entries, never a genuinely
    // detected flight date. Without this, a real return flight found 3+ days out (outside the
    // narrow end..end+2 window) could never override the arbitrary end+1 guess.
    const flightRetDayIsDefault = new Set<string>();

    // Travel-day DA time-based eligibility (policy rules):
    //   Departure day gets DA only if departure is before 17:00
    //   Return day gets DA only if arrival is after 12:00
    const flightDepEligible = new Map<string, boolean>(); // startDate → departure before 17:00?
    const flightRetEligible = new Map<string, boolean>(); // endDate   → arrival after 12:00?
    const flightDepTime     = new Map<string, string>();  // startDate → "HH:MM" for remarks
    const flightArrTime     = new Map<string, string>();  // endDate   → "HH:MM" for remarks
    // For overnight return flights: arrival date is different from departure date → add as India DA day
    const flightRetArrDay   = new Map<string, string>(); // endDate → arrival ISO date (if overnight)
    // For overnight outbound connecting flights: final leg arrives at destination the next day → add as destCountry DA day
    const flightDepArrDay   = new Map<string, string>(); // startDate → arrival ISO date at destination (if overnight final leg)

    // IST-based travel-day DA: store arrival/departure times + country for timezone conversion
    const outboundArrTimeLocal = new Map<string, string>(); // startDate → outbound arrival HH:MM (destination local)
    const outboundArrCountry   = new Map<string, string>(); // startDate → outbound arrival country
    const returnDepTimeLocal   = new Map<string, string>(); // endDate   → return departure HH:MM (intl local)
    const returnDepCountry     = new Map<string, string>(); // endDate   → return departure country

    // Long-term stay detection (≥ 30 days → DA not applicable per policy)
    const longTermAsgnIds = new Set<string>();
    // OB (On-Bench) assignment detection (DA not applicable)
    const obAsgnIds = new Set<string>();

    assignments.forEach(a => {
      const start = a.startDate || fromDate;
      const end   = a.endDate   || toDate;

      // Long-term stay: ≥ 30 days duration → mark as non-applicable
      const spanDays = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
      if (spanDays >= 30 && a.assignmentId) longTermAsgnIds.add(a.assignmentId);

      // OB check: batchType or batchCategory contains OB / On-Bench
      const bt = (a.batchType || '').toUpperCase();
      const bc = (a.batchCategory || '').toUpperCase();
      if ((bt === 'OB' || bt.includes('BENCH') || bc.includes('OB') || bc.includes('BENCH')) && a.assignmentId) {
        obAsgnIds.add(a.assignmentId);
      }

      // Outbound: find active flight departing within a window before assignment start.
      // Window widened to -6 days (was -2) to catch trainers who arrive several days early
      // and stay locally before the batch begins (e.g. multi-day domestic pre-batch stay,
      // or a connecting return-from-a-previous-trip leg landing a few days before start).
      const outboundCandidates = activeFlights.filter(f => {
        const fd = parseDT(f.departure_date);
        return fd ? fd >= addDays(start, -6) && fd <= addDays(start, 1) : false;
      });
      // Priority 1: the LATEST candidate whose to_city exactly matches the assignment's
      // training city — this is the actual final leg that brought the trainer to the
      // training destination, regardless of how many days before start it departed.
      const cityMatches = a.city
        ? outboundCandidates.filter(f => (f.to_city || '').trim().toLowerCase() === a.city!.trim().toLowerCase())
        : [];
      const cityMatchPick = cityMatches.length === 0 ? null
        : cityMatches.reduce((latest, f) => {
            const ld = parseDT(latest.departure_date) || '';
            const fd = parseDT(f.departure_date) || '';
            return fd > ld ? f : latest;
          });
      // Priority 2 (fallback): pick the leg with the EARLIEST departure time so the actual
      // first leg determines depEligible, not a connecting leg that departs later the same
      // day (which could be after 17:00). Used when no exact-city match is found (e.g.
      // assignment has no city set, or international assignments matched by country instead).
      const outbound = cityMatchPick ?? (outboundCandidates.length === 0 ? null
        : outboundCandidates.reduce((earliest, f) => {
            const ed = parseDT(earliest.departure_date) || '';
            const fd = parseDT(f.departure_date) || '';
            if (fd < ed) return f;
            if (fd > ed) return earliest;
            // Same departure date: pick the one with the earlier departure time
            const et = (earliest.departure_time || '').substring(0, 5);
            const ft = (f.departure_time || '').substring(0, 5);
            return ft < et ? f : earliest;
          }));
      if (outbound) {
        const fd = parseDT(outbound.departure_date);
        if (fd && fd > start) {
          // Flight departs AFTER assignment start (e.g. day 2) — that date is the actual travel day;
          // startDate itself is a pre-travel India day
          flightDepDay.set(start, fd);
        } else if (fd && fd < start) {
          // Flight departs before the assignment starts → that date is the travel day
          flightDepDay.set(start, fd);
        }
        // If fd === start: flight is on start day (after-midnight or same-day) — no extra dep day
        // Time eligibility: departure must be before 17:00. Must be checked against the
        // EARLIEST leg departing on THIS specific date (fd) — not necessarily `outbound` itself,
        // which (via cityMatchPick) may be a LATER connecting leg on the same day chosen only to
        // identify the correct destination/travel date. Bug fixed 2026-08-11: Girish Kumar
        // EMP-207 — Chandigarh→Hyderabad (dep 15:30) then Hyderabad→Chennai (dep 20:40) same
        // day; cityMatchPick correctly picked 12 Jul via the Chennai-arriving leg, but then
        // wrongly used ITS 20:40 departure (≥17:00) for eligibility instead of the trainer's
        // actual 15:30 departure from home — silently dropping the whole day.
        const earliestOnFd = fd
          ? outboundCandidates
              .filter(f => parseDT(f.departure_date) === fd)
              .reduce((earliest, f) => {
                if (!earliest) return f;
                const et = (earliest.departure_time || '').substring(0, 5);
                const ft = (f.departure_time || '').substring(0, 5);
                return ft < et ? f : earliest;
              }, outbound)
          : outbound;
        const rawDepTime = (earliestOnFd.departure_time || '').trim();
        const depHHMM    = rawDepTime.substring(0, 5); // "HH:MM"
        flightDepTime.set(start, depHHMM);
        // Eligible if no time data (default allow) or time < "17:00"
        flightDepEligible.set(start, !rawDepTime || rawDepTime.substring(0, 5) < '17:00');
        // Store outbound arrival info for IST-based DA calculation
        const outArrHHMM = (outbound.arrival_time || '').substring(0, 5);
        const outToCity  = (outbound.to_city || '').trim();
        const outArrCountry = inferCountryFromCity(outToCity);
        outboundArrTimeLocal.set(start, outArrHHMM);
        outboundArrCountry.set(start, outArrCountry);

        // Overnight outbound connecting flight: if the first outbound leg doesn't land at the
        // assignment destination country (e.g. Delhi→Bangkok only), look for a connecting leg
        // that arrives at the assignment destination on a LATER date.
        // Example: TG 324 Delhi→Bangkok (02 Aug), TG 471 Bangkok→Sydney (02 Aug dep, 03 Aug arr)
        // → 03 Aug should get Australia DA (trainer physically in Sydney).
        const asgnDestCountryForDep = a.country && a.country !== 'India'
          ? a.country
          : (a.city ? inferCountryFromCity(a.city) : '');
        if (asgnDestCountryForDep && asgnDestCountryForDep !== 'India' && outArrCountry !== asgnDestCountryForDep) {
          // First outbound leg didn't reach the destination — look for connecting leg TO destination
          const connectingLeg = activeFlights.find(f => {
            const fd = parseDT(f.departure_date);
            if (!fd) return false;
            // Connecting leg departs on same day or day after the first outbound leg
            const outDepDate = parseDT(outbound.departure_date);
            if (!outDepDate || fd < outDepDate || fd > addDays(outDepDate, 2)) return false;
            const toCountry = inferCountryFromCity((f.to_city || '').trim());
            return toCountry === asgnDestCountryForDep;
          });
          if (connectingLeg) {
            const connArrDate = resolveArrDate(connectingLeg) || null;
            const connDepDate = parseDT(connectingLeg.departure_date);
            if (connArrDate && connDepDate && connArrDate > connDepDate) {
              // Final leg is overnight — trainer arrives at destination on connArrDate
              flightDepArrDay.set(start, connArrDate);
            }
          }
        }
      } else {
        // No flight data → standard: day before start; default eligible
        flightDepDay.set(start, addDays(start, -1));
        flightDepEligible.set(start, true);
      }

      // Return: find active flight departing on or within 2 days after assignment end.
      // For international assignments, prefer the leg departing FROM the assignment country (the actual return leg),
      // not a domestic connection (e.g. Mumbai→Bangalore after landing in India).
      const candidateRetFlights = activeFlights
        .filter(f => { const fd = parseDT(f.departure_date); return fd ? fd >= end && fd <= addDays(end, 2) : false; })
        .sort((a, b) => {
          const da = parseDT(a.departure_date);
          const db = parseDT(b.departure_date);
          return da && db ? (da < db ? -1 : da > db ? 1 : 0) : 0;
        });
      // Prefer the earliest leg departing from the assignment country (the actual international return leg)
      const asgnRawCountry = a.country || '';
      const asgnCityCountry = a.city ? inferCountryFromCity(a.city) : '';
      const asgnDestCountry = (asgnRawCountry === 'India' && asgnCityCountry && asgnCityCountry !== 'India')
        ? asgnCityCountry : (asgnRawCountry || asgnCityCountry);
      const returnFlight = (asgnDestCountry && asgnDestCountry !== 'India'
        ? (candidateRetFlights.find(f => {
            const fromCountry = inferCountryFromCity((f.from_city || '').trim());
            return fromCountry !== 'India';
          }) ?? candidateRetFlights[0])
        : candidateRetFlights[0]) ?? null;
      if (returnFlight) {
        const fd = parseDT(returnFlight.departure_date);
        if (fd && fd > end) {
          // Return flight departs after assignment ends → that date is the return travel day
          flightRetDay.set(end, fd);
        }
        // If fd === end: trainer departs on last day of assignment — no extra return day
        // Chase to the FINAL same-day connecting leg (e.g. international leg lands at a transit
        // city, then a domestic connector reaches the trainer's actual base) — arrival-time
        // eligibility must be evaluated against the FINAL arrival, not an intermediate stopover.
        const finalLeg = resolveFinalSameDayLeg(returnFlight);
        // Overnight return flight: arrival_date > departure_date → add arrival date as India DA day
        const rawArrDate = (finalLeg.arrival_date || '').trim();
        const arrDate = rawArrDate ? parseDT(rawArrDate) : null;
        if (arrDate && fd && arrDate > fd) {
          flightRetArrDay.set(end, arrDate);
        }
        // Time eligibility for return: arrival at base must be after 12:00
        const rawArrTime = (finalLeg.arrival_time || '').trim();
        const arrHHMM    = rawArrTime.substring(0, 5);
        flightArrTime.set(end, arrHHMM);
        // Policy: return day eligible only if arrival at base is AFTER 12:00 (strictly)
        flightRetEligible.set(end, !rawArrTime || rawArrTime.substring(0, 5) > '12:00');
        // Store return departure info (from international city) for IST-based DA calculation
        const retDepHHMM    = (returnFlight.departure_time || '').substring(0, 5);
        const retFromCity   = (returnFlight.from_city || '').trim();
        const retDepCountry = inferCountryFromCity(retFromCity);
        returnDepTimeLocal.set(end, retDepHHMM);
        returnDepCountry.set(end, retDepCountry);
      } else {
        // No flight found in the narrow end..end+2 window → standard: day after end; default
        // eligible. Marked as a default guess so the wider supplement scan below can still
        // override it if a real return flight is found further out.
        flightRetDay.set(end, addDays(end, 1));
        flightRetEligible.set(end, true);
        flightRetDayIsDefault.add(end);
      }
    });

    // ── Flight-based return day supplement ─────────────────────────────────────
    // For any assignment where the return flight was not detected (or detected incorrectly),
    // scan all active flights for a departure FROM the destination country after assignment end.
    // This ensures the return travel day always gets included in the DA table even when
    // the candidateRetFlights logic misses it (e.g. connecting multi-leg journeys).
    assignments.forEach(a => {
      const aEnd = a.endDate || toDate;
      const asgnRawC = a.country || '';
      const asgnCityC = a.city ? inferCountryFromCity(a.city) : '';
      const asgnDestC = (asgnRawC === 'India' && asgnCityC && asgnCityC !== 'India')
        ? asgnCityC : (asgnRawC || asgnCityC);
      if (!asgnDestC || asgnDestC === 'India') return;
      // Find the EARLIEST flight departing FROM the destination country after assignment end —
      // .find() alone picks unsorted API array order, not chronological order. Bug fixed
      // 2026-08-11 (same class as the outbound-leg regression, see feedback_claimdetail_two_pass_bug):
      // if multiple flights depart the destination country within the window, the wrong one
      // could be picked, corrupting the return date and the departure-time eligibility check.
      const retFltFromDestCandidates = activeFlights.filter(f => {
        const fd = parseDT(f.departure_date);
        if (!fd || fd <= aEnd || fd > addDays(aEnd, 5)) return false;
        const fromC = inferCountryFromCity((f.from_city || '').trim());
        return fromC === asgnDestC;
      });
      const retFltFromDest = retFltFromDestCandidates.length === 0 ? null
        : retFltFromDestCandidates.reduce((earliest, f) => {
            const ed = parseDT(earliest.departure_date) || '';
            const fd = parseDT(f.departure_date) || '';
            if (fd < ed) return f;
            if (fd > ed) return earliest;
            const et = (earliest.departure_time || '').substring(0, 5);
            const ft = (f.departure_time || '').substring(0, 5);
            return ft < et ? f : earliest;
          });
      if (retFltFromDest) {
        const fd = parseDT(retFltFromDest.departure_date);
        // Override a genuinely-detected flight date over an arbitrary "end+1" default guess —
        // but never override an already-correctly-detected flight date. Bug fixed 2026-08-10:
        // Ankur Kumar EMP-2485 — his real Dubai→Nairobi flight departs 19 Jul, 3 days outside
        // the primary block's narrow end..end+2 window, so primary fell back to a default
        // guess of 17 Jul (end+1). Without this override, 17 Jul was wrongly treated as "the
        // return day" and mis-assigned India DA via the <04:00-departure fallback — even
        // though the trainer was still in Dubai, and even though he wasn't returning to India
        // at all (Nairobi is a new international destination, not home).
        if (fd && (!flightRetDay.has(aEnd) || flightRetDayIsDefault.has(aEnd))) {
          flightRetDay.set(aEnd, fd);
          flightRetDayIsDefault.delete(aEnd);
          // Chase to the FINAL same-day connecting leg — mirrors the primary block's logic. But
          // only chase when this leg itself does NOT already land in India — once the trainer is
          // back on Indian soil, any further onward domestic flight (e.g. Delhi->home city) is a
          // separate personal trip, not part of resolving the international return arrival. Bug
          // fixed 2026-08-31: TADA range check for Sreemanta Das EMP-2384, Asgn #262076/#263909 —
          // London->Delhi arrives 05:10, but chasing continued into a same-day Delhi->Kolkata
          // domestic flight (dep 07:30, arrives 09:50) purely because it departed from Delhi
          // after 05:10, wrongly reporting "arrives India 09:50" in the remark text instead of
          // the true 05:10 arrival (the actual eligibility check happened to read the flight list
          // in the right order elsewhere and stayed correct, but this is fragile — same bug class
          // as the "unsorted .find()" issue already fixed nearby).
          const retLegAlreadyIndia = inferCountryFromCity((retFltFromDest.to_city || '').trim()) === 'India';
          const finalLeg = retLegAlreadyIndia ? retFltFromDest : resolveFinalSameDayLeg(retFltFromDest);
          const finalArrCountry = inferCountryFromCity((finalLeg.to_city || '').trim());
          const finalArrDateForElig = resolveArrDate(finalLeg) || fd;
          const sameDayIndia = finalArrCountry === 'India' && finalArrDateForElig === fd;
          const depHHMM = (retFltFromDest.departure_time || '').substring(0, 5);
          if (sameDayIndia) {
            // Lands in India the same day — eligibility is arrival-time-based, not
            // departure-time-based (see the primary block's sameDayIndiaReturn logic).
            const finalArrHHMM = (finalLeg.arrival_time || '').substring(0, 5);
            flightRetEligible.set(aEnd, !!finalArrHHMM && finalArrHHMM > '12:00');
          } else {
            // Does NOT land in India the same day (e.g. continuing to a different
            // international destination, or overnight) — departure-time cutoff applies.
            flightRetEligible.set(aEnd, !depHHMM || depHHMM >= '04:00');
          }
          flightArrTime.set(aEnd, (finalLeg.arrival_time || '').substring(0, 5));
          const rawArrD = (finalLeg.arrival_date || '').trim();
          const arrD = rawArrD ? parseDT(rawArrD) : null;
          if (arrD && arrD > fd) flightRetArrDay.set(aEnd, arrD);
          returnDepTimeLocal.set(aEnd, depHHMM);
          returnDepCountry.set(aEnd, asgnDestC);
        }
      }
    });

    // Build a set of all dates to show:
    // • Actual departure day (from flight or startDate − 1)
    // • all days within each assignment's startDate..endDate
    // • Actual return day (from flight or endDate + 1)
    // Shows ALL assignment days regardless of selected date window — trainer needs
    // full trip DA, not just the slice the user happened to select as the query range.
    const dateSet = new Set<string>();

    if (assignments.length === 0) {
      // No assignments — just show the selected range with no-assignment status
      isoRange(fromDate, toDate).forEach(d => dateSet.add(d));
    } else {
      assignments.forEach(a => {
        const start  = a.startDate || fromDate;
        const end    = a.endDate   || toDate;
        const dep    = flightDepDay.get(start) || addDays(start, -1);
        const ret    = flightRetDay.get(end)   || addDays(end,   1);
        // Include ALL days from departure to return — covers departure day,
        // pre-batch transit days, core assignment days, post-batch holding days, and return day.
        isoRange(dep, ret).forEach(d => dateSet.add(d));
        // For overnight return flights, the arrival date (next day) must also be shown as India DA
        const arrDay = flightRetArrDay.get(end);
        if (arrDay) dateSet.add(arrDay);
        // For overnight outbound connecting flights, the arrival date at destination gets destination DA
        const depArrDay = flightDepArrDay.get(start);
        if (depArrDay) dateSet.add(depArrDay);
        // Direct scan: any active flight arriving at the assignment destination country,
        // departing within the 5 days before assignment start and arriving on a LATER date,
        // must also appear in the DA table (covers cases where flightDepArrDay detection misses).
        const asgnCountryForScan = (a.country && a.country !== 'India')
          ? a.country
          : (a.city ? inferCountryFromCity(a.city) : '');
        if (asgnCountryForScan && asgnCountryForScan !== 'India') {
          activeFlights.forEach(f => {
            const depD = parseDT((f.departure_date || '').trim());
            const arrD = resolveArrDate(f);
            if (!depD || !arrD || arrD <= depD) return;
            if (depD < addDays(start, -5) || depD > start) return;
            const toC = inferCountryFromCity((f.to_city || '').trim());
            if (toC === asgnCountryForScan) dateSet.add(arrD);
          });
        }
      });
    }

    // Weekend/gap-fill: consecutive same-country FMAT assignments ≤ 7 days apart →
    // trainer stayed at location; add Sat/Sun (and any other gap days) to dateSet
    // and map each gap date → its associated assignment for DA calculation.
    const gapDateMap = new Map<string, typeof assignments[0]>();
    {
      const getAsgnDestC = (a: typeof assignments[0]) => {
        const cc = a.city ? inferCountryFromCity(a.city) : '';
        return (a.country === 'India' && cc && cc !== 'India') ? cc : (a.country || cc || '');
      };
      const sortedForGap = [...assignments]
        .filter(a => a.deliveryMode !== 'Online' && a.batchType !== 'ILO' && a.startDate && a.endDate)
        .sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1));
      for (let i = 0; i < sortedForGap.length - 1; i++) {
        const asgnA = sortedForGap[i];
        const asgnB = sortedForGap[i + 1];
        const destA = getAsgnDestC(asgnA);
        const destB = getAsgnDestC(asgnB);
        if (!destA || !destB) continue;
        const gapStart = addDays(asgnA.endDate!, 1);
        const gapEnd   = addDays(asgnB.startDate!, -1);
        if (gapStart > gapEnd) continue;
        const gapDays = Math.round((new Date(gapEnd).getTime() - new Date(gapStart).getTime()) / 86400000) + 1;
        if (gapDays > 7) continue;

        if (destA === destB) {
          // Same-country gap (e.g. weekend between two batches at the same destination) —
          // trainer stayed put; fill every gap day with that country's DA.
          isoRange(gapStart, gapEnd).forEach(d => {
            dateSet.add(d);
            if (!gapDateMap.has(d)) gapDateMap.set(d, asgnA);
          });
        } else {
          // DIFFERENT-country gap (e.g. Ankur Kumar EMP-2485: Dubai batch ends 16 Jul, Nairobi
          // batch starts 20 Jul) — trainer stayed in destA's country until a connecting flight
          // to destB departs. Find that bridging flight; fill days from gapStart up to (but not
          // including) its departure date with destA's DA. The departure date itself is handled
          // separately by the normal depAsgn/travel-day logic (already resolves to destB or
          // India depending on arrival time — do not duplicate that here).
          const bridgingFlight = activeFlights.find(f => {
            const fd = parseDT((f.departure_date || '').trim());
            if (!fd || fd < gapStart || fd > addDays(gapEnd, 1)) return false;
            const fromC = inferCountryFromCity((f.from_city || '').trim());
            const toC   = inferCountryFromCity((f.to_city || '').trim());
            return fromC === destA && toC === destB;
          });
          if (!bridgingFlight) continue;
          const bridgeDepDate = parseDT((bridgingFlight.departure_date || '').trim());
          if (!bridgeDepDate) continue;
          const stayEnd = addDays(bridgeDepDate, -1);
          if (stayEnd < gapStart) continue;
          isoRange(gapStart, stayEnd).forEach(d => {
            dateSet.add(d);
            if (!gapDateMap.has(d)) gapDateMap.set(d, asgnA);
          });
        }
      }
    }

    const sortedDates = Array.from(dateSet).sort();

    // ── Build apartment-coverage date set (Step 6 → Step 4) ──────────────────
    // A date is "apartment-covered" if any active accommodation whose name contains
    // "apartment" (GGN Apartment, Koenig Apartment, Serviced Apartment, etc.)
    // has checkIn ≤ date < checkOut.  We check BOTH raw PMS records (pmsAccom) and
    // already-imported lodgingEntries so the rule works even before the trainer clicks Import.
    const apartmentDates = new Set<string>();
    // Add a date range to apartmentDates (checkIn inclusive, checkOut inclusive)
    // checkOut day is included because trainer physically stays at apartment until departure morning
    const markApartmentRange = (checkIn: string, checkOut: string) => {
      if (!checkIn || !checkOut) return;
      const from = checkIn.slice(0, 10);
      const to   = checkOut.slice(0, 10);
      if (to >= from) isoRange(from, to).forEach(d => apartmentDates.add(d));
    };
    // From raw PMS accommodation records — match any variant: apartment, Apartment, Apartment's, etc.
    pmsAccom.forEach(r => {
      const isCancelled = r.Is_caneclled === '1' || r.Is_caneclled === 1;
      if (isCancelled) return;
      if (isApartmentName(r.AccommodationName ?? '')) {
        markApartmentRange(accomDT(r.CheckInDate), accomDT(r.CheckOutDate));
      }
    });
    // From manually-added / imported lodging entries
    // Detect apartment if: name contains "apartment" (any case/variant) OR stay type is "Apartment"
    lodgingEntries.forEach(l => {
      if (isApartmentName(l.hotelName) || l.stayType === 'Apartment') {
        markApartmentRange(l.checkIn, l.checkOut);
      }
    });

    return sortedDates.map(iso => {
      // ── Highest priority: overnight outbound connecting flight arrival ──────────
      // When a multi-leg outbound journey (e.g. Delhi→Bangkok→Sydney) has its FINAL leg
      // arriving at the assignment destination on the NEXT calendar day (overnight flight),
      // that arrival date must get destination-country DA regardless of any other assignment
      // (including online/ILO batches that may overlap).
      // Detection: any active flight that (a) arrives ON this date, (b) departs on an EARLIER
      // date, and (c) arrives at the assignment destination country.
      const overnightDepArrAsgn = (() => {
        for (const a of assignments) {
          const asgnStart = a.startDate || fromDate;
          // Only consider flights departing in the 3 days before assignment start
          const windowStart = addDays(asgnStart, -5);
          const windowEnd   = asgnStart;
          // Determine assignment destination country
          const asgnCountry = (a.country && a.country !== 'India')
            ? a.country
            : (a.city ? inferCountryFromCity(a.city) : '');
          if (!asgnCountry || asgnCountry === 'India') continue;
          // Find any flight arriving on this date at the destination country
          const found = activeFlights.find(f => {
            const arrDate = resolveArrDate(f);
            if (arrDate !== iso) return false;
            const depDate = parseDT((f.departure_date || '').trim());
            if (!depDate || depDate >= iso) return false; // same-day arrivals handled by depAsgn
            if (depDate < windowStart || depDate > windowEnd) return false;
            const toCountry = inferCountryFromCity((f.to_city || '').trim());
            return toCountry === asgnCountry;
          });
          if (found) return a;
        }
        return null;
      })();

      // Find the assignment whose core range (startDate..endDate) covers this date
      const coreAsgn = !overnightDepArrAsgn
        ? assignments.find(a =>
            a.startDate && a.endDate && iso >= a.startDate && iso <= a.endDate,
          )
        : null;

      // Check if this is a departure travel day (actual flight date before assignment start)
      const depAsgn = !overnightDepArrAsgn && !coreAsgn
        ? assignments.find(a => {
            const depDay = flightDepDay.get(a.startDate || fromDate);
            return depDay === iso;
          })
        : null;

      // Check if this is a return travel day (actual flight date after assignment end)
      const retAsgn = !overnightDepArrAsgn && !coreAsgn && !depAsgn
        ? assignments.find(a => {
            const retDay = flightRetDay.get(a.endDate || toDate);
            return retDay === iso;
          })
        : null;

      // Policy: days between the departure flight and assignment start (pre-batch transit),
      // or between assignment end and return flight (post-batch holding), are eligible for DA
      // at the destination country rate — the trainer is abroad during these days.
      const interimAsgn = !overnightDepArrAsgn && !coreAsgn && !depAsgn && !retAsgn
        ? assignments.find(a => {
            const aStart  = a.startDate || fromDate;
            const aEnd    = a.endDate   || toDate;
            const depDay  = flightDepDay.get(aStart) || addDays(aStart, -1);
            const retDay  = flightRetDay.get(aEnd)   || addDays(aEnd,   1);
            return (iso > depDay && iso < aStart) || (iso > aEnd && iso < retDay);
          })
        : null;

      // Overnight return flight: arrival date is the day AFTER departure — trainer has landed in India
      const overnightArrAsgn = !overnightDepArrAsgn && !coreAsgn && !depAsgn && !retAsgn && !interimAsgn
        ? assignments.find(a => flightRetArrDay.get(a.endDate || toDate) === iso)
        : null;

      // Gap day between consecutive same-country assignments (weekends, holidays)
      const gapAsgn = !overnightDepArrAsgn && !coreAsgn && !depAsgn && !retAsgn && !interimAsgn && !overnightArrAsgn
        ? (gapDateMap.get(iso) ?? null)
        : null;

      const asgn = overnightDepArrAsgn ?? coreAsgn ?? depAsgn ?? retAsgn ?? interimAsgn ?? overnightArrAsgn ?? gapAsgn ?? null;
      const isDeparture        = !!depAsgn;
      const isReturn           = !!retAsgn;
      const isInterim          = !!interimAsgn;
      const isOvernightArrival = !!overnightArrAsgn;
      const isOvernightDepArrival = !!overnightDepArrAsgn;

      // PMS sometimes stores country='India' even for international assignments.
      // Override using city when country='India' but city resolves to a different country.
      const rawCountry  = asgn?.country || primaryCountry;
      const cityCountry = asgn?.city ? inferCountryFromCity(asgn.city) : '';
      const destCountry = (rawCountry === 'India' && cityCountry && cityCountry !== 'India')
        ? cityCountry
        : rawCountry;
      // On travel days for international assignments, the trainer departs from/arrives in
      // India, so India DA rate (₹950) applies — EXCEPT when the return arrival is between
      // 12:00 and 17:00, in which case destination country DA rate applies per policy.
      // LAYOVER RULE: if any connecting flight on this travel day has a layover of 4+ hours
      // in a non-India country, apply that country's DA rate instead of India rate.
      // ── Travel-day DA rule (local time comparison) ────────────────────────────
      // Departure day: if trainer arrives at international destination before 18:00
      // local time → spent 4+ hours there before end of working day → intl DA.
      // Return day: if trainer departs international country at/after 04:00 local
      // time → spent 4+ hours there → intl DA.
      // All comparisons use LOCAL destination time (not IST) — this matches the
      // user-visible flight arrival/departure times shown in Step 5.

      let isInternationalTravelDay = false;
      let travelDayCountry = destCountry;

      if (isDeparture && destCountry !== 'India' && destCountry !== '') {
        const asgnStart = asgn?.startDate || fromDate;
        // If the previous assignment was in the same country, trainer was already in-country —
        // no departure flight needed, so give full international DA.
        const prevAsgn = allNearbyAssignments
          .filter(a => a !== asgn && a.endDate && a.endDate < asgnStart)
          .sort((a, b) => (b.endDate! > a.endDate! ? 1 : -1))[0] ?? null;
        const prevCountry = prevAsgn
          ? ((prevAsgn.country === 'India' && prevAsgn.city ? inferCountryFromCity(prevAsgn.city) : prevAsgn.country) || inferCountryFromCity(prevAsgn.city || ''))
          : '';
        if (prevCountry === destCountry) {
          travelDayCountry = destCountry; // already in-country (consecutive same-country assignments)
        } else {
          // Apply outbound flight arrival-time cutoff. Pick the EARLIEST-departing leg in the
          // window (not array order), then chase forward through same-day connecting legs to
          // the FINAL arrival — a multi-leg journey (e.g. Chandigarh→Delhi→Dubai) must be judged
          // by when the trainer actually reaches the destination, not an intermediate domestic hop.
          const outboundCandidatesForCountry = activeFlights.filter(f => {
            const fd = parseDT(f.departure_date);
            return fd ? fd >= addDays(asgnStart, -2) && fd <= addDays(asgnStart, 1) : false;
          });
          const earliestOutboundForCountry = outboundCandidatesForCountry.reduce((earliest, f) => {
            if (!earliest) return f;
            const et = (earliest.departure_time || '').substring(0, 5);
            const ft = (f.departure_time || '').substring(0, 5);
            return ft < et ? f : earliest;
          }, undefined as typeof activeFlights[0] | undefined);
          const outboundFlight = earliestOutboundForCountry ? resolveFinalSameDayLeg(earliestOutboundForCountry) : undefined;
          const arrLocal = outboundFlight ? (outboundFlight.arrival_time || '').substring(0, 5) : '';
          if (arrLocal) {
            // Arrival at the destination at/before 17:00 local → destination DA (enough of the
            // day left there). After 17:00 → India DA (trainer only just arrived).
            if (arrLocal <= '17:00') {
              travelDayCountry = destCountry;
            } else {
              travelDayCountry = 'India';
              isInternationalTravelDay = true;
            }
          } else {
            travelDayCountry = 'India';
            isInternationalTravelDay = true;
          }
        }
      } else if (isOvernightArrival) {
        // Trainer has landed back in India after an overnight return flight — India DA
        travelDayCountry = 'India';
      } else if (isOvernightDepArrival) {
        // Trainer arrived at the international destination via overnight connecting flight — destination DA
        travelDayCountry = destCountry;
      } else if (isReturn && destCountry !== 'India' && destCountry !== '') {
        const asgnEnd = asgn?.endDate || toDate;
        // If the next assignment is in the same country, trainer stays in-country —
        // no return flight, so give full international DA.
        const nextAsgn = allNearbyAssignments
          .filter(a => a !== asgn && a.startDate && a.startDate > asgnEnd)
          .sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1))[0] ?? null;
        const nextCountry = nextAsgn
          ? ((nextAsgn.country === 'India' && nextAsgn.city ? inferCountryFromCity(nextAsgn.city) : nextAsgn.country) || inferCountryFromCity(nextAsgn.city || ''))
          : '';
        if (nextCountry === destCountry) {
          travelDayCountry = destCountry; // stays in-country (consecutive same-country assignments)
        } else {
          // Prefer the EARLIEST leg departing FROM the destination country (the actual return
          // leg), not a domestic connection or transit leg — ensures correct DA for multi-leg
          // journeys. .find() alone picks unsorted API array order, not chronological order —
          // fixed 2026-08-11 alongside the same regression in the flight-based supplement above.
          const retFlightFromDestCandidates = activeFlights.filter(f => {
            const fd = parseDT(f.departure_date);
            return fd ? fd >= asgnEnd && fd <= addDays(asgnEnd, 5) && inferCountryFromCity((f.from_city || '').trim()) === destCountry : false;
          });
          const retFlightFromDest = retFlightFromDestCandidates.length === 0 ? null
            : retFlightFromDestCandidates.reduce((earliest, f) => {
                const ed = parseDT(earliest.departure_date) || '';
                const fd = parseDT(f.departure_date) || '';
                if (fd < ed) return f;
                if (fd > ed) return earliest;
                const et = (earliest.departure_time || '').substring(0, 5);
                const ft = (f.departure_time || '').substring(0, 5);
                return ft < et ? f : earliest;
              });
          const returnFlight2 = retFlightFromDest ?? activeFlights
            .filter(f => {
              const fd = parseDT(f.departure_date);
              return fd ? fd >= asgnEnd && fd <= addDays(asgnEnd, 5) : false;
            })
            .reduce((earliest, f) => {
              if (!earliest) return f;
              const ed = parseDT(earliest.departure_date) || '';
              const fd = parseDT(f.departure_date) || '';
              if (fd < ed) return f;
              if (fd > ed) return earliest;
              const et = (earliest.departure_time || '').substring(0, 5);
              const ft = (f.departure_time || '').substring(0, 5);
              return ft < et ? f : earliest;
            }, undefined as typeof activeFlights[0] | undefined);

          // If the journey lands back in India the SAME calendar day (chasing through any
          // same-day domestic connector to the trainer's actual base), still apply the same
          // departure-time cutoff as the non-same-day case below — reaching India the same
          // day does NOT by itself mean the whole day counts as "home". Bug fixed 2026-08-20:
          // Pratik EMP-3214 departed Manila (Philippines) at 12:30 local, a short (<4 hr, so
          // not a qualifying layover) Hong Kong connection, arriving Mumbai 21:05 the same
          // day — he spent the working part of the day in the Philippines and should get
          // Philippines DA, not India DA, just because the connecting flight happened to land
          // in India before midnight. Only an early (<04:00 local) departure from the
          // destination country — i.e. negligible time actually spent there that day — should
          // fall back to India DA. This still gives the correct answer for the original fix
          // this branch was added for, Bhavna Singh EMP-3505 (KL→Chennai arrives 06:55, i.e.
          // departed KL before 04:00 local).
          const finalRetLeg2 = returnFlight2 ? resolveFinalSameDayLeg(returnFlight2) : null;
          const finalToCountry = finalRetLeg2 ? inferCountryFromCity((finalRetLeg2.to_city || '').trim()) : '';
          const finalArrDate = finalRetLeg2 ? (resolveArrDate(finalRetLeg2) || parseDT(returnFlight2!.departure_date)) : '';
          const finalDepDate = returnFlight2 ? parseDT(returnFlight2.departure_date) : '';
          const sameDayIndiaReturn = finalToCountry === 'India' && finalArrDate === finalDepDate;

          if (sameDayIndiaReturn) {
            // The FINAL leg's arrival at the trainer's actual base is what decides the country,
            // not how early they left the destination country. Bug fixed 2026-08-31: Vaibhav
            // Doshi EMP-2624, TADA-2026-00138 — Singapore->Mumbai (dep 08:45, >=04:00) then
            // Mumbai->Udaipur (his actual base, arrives 16:00) all same day. The old rule kept
            // Singapore DA purely because the Singapore departure was >=04:00, ignoring that the
            // SECOND leg is what actually gets him home. Eligibility (arrival <=12:00 -> Not
            // Eligible) is enforced separately via flightRetEligible; here we only need the
            // correct COUNTRY when it IS eligible — always India once the final same-day leg
            // lands at the trainer's base.
            travelDayCountry = 'India';
          } else if (finalToCountry && finalToCountry !== 'India' && finalToCountry !== destCountry) {
            // Heading to a DIFFERENT international destination, not returning home to India —
            // keep full destCountry DA rather than assuming India just because departure was
            // before 04:00. Bug fixed 2026-08-10: Ankur Kumar EMP-2485 — Dubai→Nairobi is a
            // continuation to a new assignment, not a return to India.
            travelDayCountry = destCountry;
          } else {
            const depLocal = returnFlight2 ? (returnFlight2.departure_time || '').substring(0, 5) : '';
            if (depLocal) {
              if (depLocal >= '04:00') {
                travelDayCountry = destCountry;
              } else {
                travelDayCountry = 'India';
                isInternationalTravelDay = true;
              }
            } else {
              const endKey = asgn?.endDate || toDate;
              const arrHHMMReturn = flightArrTime.get(endKey) || '';
              if (arrHHMMReturn >= '12:00') {
                travelDayCountry = destCountry;
              } else {
                travelDayCountry = 'India';
                isInternationalTravelDay = true;
              }
            }
          }
        }
      }

      // Layover rule overrides everything: 4+ hr non-India layover → that country's DA
      const layoverInfo = (isDeparture || isReturn) ? getLayoverCountry(iso) : null;
      let country = layoverInfo
        ? layoverInfo.country
        : travelDayCountry;

      // Narrow, ADDITIVE override — does not change which day is classified as departure/return/
      // core/etc., only corrects the final country for one specific, tightly-scoped case: a date
      // that (a) the same-country weekend/gap-fill logic (gapDateMap) already confirms is a
      // stay-put day between two consecutive same-country assignments, (b) resolved to India only
      // because the departure/return-day logic found NO real flight at all to check (a baseless
      // start-1/end+1 guess), and (c) there genuinely is no flight for this trainer anywhere near
      // that assignment boundary. Every other trainer's flight-backed classification is untouched.
      // Bug fixed 2026-09-03: Soumik Das Purkayastha EMP-3639 (based in Paris, France, zero flight
      // data on file between his consecutive UK assignments) — 25-26 Jul and 8-9 Aug, the weekends
      // between his back-to-back UK batches, were wrongly defaulting to India.
      let gapCountryOverrideNote: string | null = null;
      if (!layoverInfo && country === 'India' && (isDeparture || isReturn) && asgn && gapDateMap.has(iso)) {
        const gapAsgnForDay = gapDateMap.get(iso);
        const gapCC = gapAsgnForDay?.city ? inferCountryFromCity(gapAsgnForDay.city) : '';
        const gapDestC = (gapAsgnForDay?.country === 'India' && gapCC && gapCC !== 'India')
          ? gapCC : (gapAsgnForDay?.country || gapCC || '');
        if (gapDestC && gapDestC !== 'India') {
          const boundaryDate = isDeparture ? (asgn.startDate || fromDate) : (asgn.endDate || toDate);
          const hasRealFlightNearBoundary = activeFlights.some(f => {
            const fd = parseDT(f.departure_date);
            if (!fd) return false;
            return isDeparture
              ? (fd >= addDays(boundaryDate, -6) && fd < boundaryDate)
              : (fd >= boundaryDate && fd <= addDays(boundaryDate, 2));
          });
          if (!hasRealFlightNearBoundary) {
            country = gapDestC;
            gapCountryOverrideNote = gapDestC;
          }
        }
      }

      const asgnId     = asgn?.assignmentId || '';
      const asgnCourse = asgn?.courseName   || '';
      const daInfo     = getDaInfo(country, layoverInfo ? undefined : isInternationalTravelDay ? undefined : asgn?.city);
      const { rate, currency, allowed } = daInfo;

      const isFuture  = iso > today;
      const isToday   = iso === today;
      const asgnTag   = asgnId ? `Asgn #${asgnId}` : (asgnCourse || '—');

      let status: string;
      let statusClass: string;
      let amount: number;
      let remarks: string;

      // ILO / Online batches: DA not applicable per policy
      const isOnlineBatch = asgn &&
        (asgn.batchType === 'ILO' || asgn.deliveryMode === 'Online');

      // Step 6 → Step 4: check apartment coverage for this date
      // apartmentDates is built above (outside the per-date loop) from pmsAccom + lodgingEntries
      const isStayingInApartment = apartmentDates.has(iso);

      // Delhi-NCR rule (per policy):
      // DA NOT allowed if city is within Delhi-NCR AND trainer is NOT in an apartment stay.
      // DA IS allowed if within Delhi-NCR AND accommodation name contains "apartment"
      // (GGN Apartment, Koenig Apartment, Serviced Apartment, etc. — checked by name, not manual selection).
      const inDelhiNcrCity = country === 'India' && !isInternationalTravelDay && asgn != null &&
        DELHI_NCR_CITIES.has((asgn.city || '').toLowerCase().trim());
      const isDelhiNcr = inDelhiNcrCity && !isStayingInApartment;

      // Long-term stay and OB flags (new policy rules)
      const isLongTermStay = asgn?.assignmentId ? longTermAsgnIds.has(asgn.assignmentId) : false;
      const isOBAssignment = asgn?.assignmentId ? obAsgnIds.has(asgn.assignmentId) : false;

      // Travel-day time eligibility
      const depEligible = flightDepEligible.get(asgn?.startDate || '') ?? true;
      const retEligible = flightRetEligible.get(asgn?.endDate   || '') ?? true;
      const depTimeStr  = flightDepTime.get(asgn?.startDate || '') || '';
      const arrTimeStr  = flightArrTime.get(asgn?.endDate   || '') || '';

      if (!asgn) {
        // Date is in the window but no assignment covers it at all
        status      = 'No Assignment';
        statusClass = 'bg-gray-100 text-gray-500 border border-gray-200';
        amount      = 0;
        remarks     = 'No assignment covers this date';
      } else if (isOnlineBatch) {
        status      = 'Not Applicable — Online Batch (ILO)';
        statusClass = 'bg-red-100 text-red-600 border border-red-200';
        amount      = 0;
        remarks     = `${asgnTag} — ILO/Online batch, DA not eligible per policy`;
      } else if (isDelhiNcr) {
        status      = 'Not Applicable — Delhi-NCR (No Apartment Stay)';
        statusClass = 'bg-gray-100 text-gray-500 border border-gray-300';
        amount      = 0;
        remarks     = `${asgnTag} — No DA within Delhi-NCR unless staying in an apartment (Step 6). Add apartment stay in Step 6 to enable DA.`;
      } else if (isLongTermStay) {
        status      = 'Not Applicable — Long Term Stay (≥30 days)';
        statusClass = 'bg-gray-100 text-gray-500 border border-gray-300';
        amount      = 0;
        remarks     = `${asgnTag} — Long-term stay (≥30 days); TA/DA settled monthly per policy`;
      } else if (isOBAssignment) {
        status      = 'Not Applicable — OB Assignment';
        statusClass = 'bg-gray-100 text-gray-500 border border-gray-300';
        amount      = 0;
        remarks     = `${asgnTag} — On-bench assignment, DA not applicable per policy`;
      } else if (leaveDates.has(iso)) {
        status      = 'Leave Day — DA Not Eligible';
        statusClass = 'bg-orange-100 text-orange-700 border border-orange-200';
        amount      = 0;
        remarks     = 'Marked as leave';
      } else if (!allowed) {
        status      = 'Not Allowed — Mismatch';
        statusClass = 'bg-red-100 text-red-600 border border-red-200';
        amount      = 0;
        remarks     = `${asgnTag} — country not in DA policy`;
      } else if (isFuture) {
        status      = 'Not Allowed (Future Date)';
        statusClass = 'bg-red-100 text-red-600 border border-red-200';
        amount      = 0;
        remarks     = `${asgnTag} — future date`;
      } else if (isDeparture && !depEligible) {
        // Departure after 17:00 → travel day DA not applicable per policy
        status      = 'Not Eligible — Departure After 17:00';
        statusClass = 'bg-amber-50 text-amber-700 border border-amber-200';
        amount      = 0;
        remarks     = `${asgnTag} — flight departs at ${depTimeStr || '?'} (after 17:00); travel day DA not applicable per policy`;
      } else if (isReturn && !retEligible && !flightRetArrDay.has(asgn?.endDate || '')) {
        // Arrival before 12:00 → return day DA not applicable per policy
        // (Skip this check for overnight flights — arrival is on the next day, handled separately)
        status      = 'Not Eligible — Return Arrival Before 12:00';
        statusClass = 'bg-amber-50 text-amber-700 border border-amber-200';
        amount      = 0;
        remarks     = `${asgnTag} — arrives at ${arrTimeStr || '?'} (before 12:00); return day DA not applicable per policy`;
      } else if (isDeparture) {
        status      = 'Allowed (Travel Day)';
        statusClass = 'bg-blue-100 text-blue-700';
        amount      = rate;
        const depNote  = depTimeStr ? `, departs ${depTimeStr}` : '';
        const asgnStart2   = asgn?.startDate || fromDate;
        const outbCandidates2 = activeFlights.filter(f => { const fd = parseDT(f.departure_date); return fd ? fd >= addDays(asgnStart2, -2) && fd <= asgnStart2 : false; });
        const earliestOutb2 = outbCandidates2.reduce((earliest, f) => {
          if (!earliest) return f;
          const et = (earliest.departure_time || '').substring(0, 5);
          const ft = (f.departure_time || '').substring(0, 5);
          return ft < et ? f : earliest;
        }, undefined as typeof activeFlights[0] | undefined);
        const outbFlight2  = earliestOutb2 ? resolveFinalSameDayLeg(earliestOutb2) : undefined;
        const arrLocal2    = outbFlight2 ? (outbFlight2.arrival_time || '').substring(0, 5) : '';
        const arrNote2     = arrLocal2 ? `, arrives ${arrLocal2} local` : '';
        remarks     = layoverInfo
          ? `${asgnTag} — departure day; ${layoverInfo.country} layover ${layoverInfo.layoverHours.toFixed(1)} hrs (≥4 hrs); ${layoverInfo.country} DA applied${depNote}`
          : isInternationalTravelDay
            ? `${asgnTag} — departure to ${destCountry}${depNote}${arrNote2}; arrival after 17:00 local, India DA applied`
            : destCountry !== 'India'
              ? `${asgnTag} — departure to ${destCountry}${depNote}${arrNote2}; arrival by 17:00 local, ${destCountry} DA applied`
              : `${asgnTag} — departure day${depNote}`;
      } else if (isReturn) {
        status      = 'Allowed (Return Day)';
        statusClass = 'bg-blue-100 text-blue-700';
        amount      = rate;
        const arrNote   = arrTimeStr ? `, arrives India ${arrTimeStr}` : '';
        const asgnEnd2     = asgn?.endDate || toDate;
        const retCandidates2 = activeFlights.filter(f => { const fd = parseDT(f.departure_date); return fd ? fd >= asgnEnd2 && fd <= addDays(asgnEnd2, 2) : false; });
        const retFlight2   = retCandidates2.reduce((earliest, f) => {
          if (!earliest) return f;
          const ed = parseDT(earliest.departure_date) || '';
          const fd = parseDT(f.departure_date) || '';
          if (fd < ed) return f;
          if (fd > ed) return earliest;
          const et = (earliest.departure_time || '').substring(0, 5);
          const ft = (f.departure_time || '').substring(0, 5);
          return ft < et ? f : earliest;
        }, undefined as typeof activeFlights[0] | undefined);
        const retDepLocal2 = retFlight2 ? (retFlight2.departure_time || '').substring(0, 5) : '';
        const retDepNote   = retDepLocal2 ? `departs ${destCountry} ${retDepLocal2} local` : '';
        remarks     = layoverInfo
          ? `${asgnTag} — return day; ${layoverInfo.country} layover ${layoverInfo.layoverHours.toFixed(1)} hrs (≥4 hrs); ${layoverInfo.country} DA applied${arrNote}`
          : isInternationalTravelDay
            ? `${asgnTag} — return from ${destCountry}; ${retDepNote}; departed before 04:00 local (<4 hrs in ${destCountry}), India DA applied${arrNote}`
            : destCountry !== 'India'
              ? `${asgnTag} — return from ${destCountry}; ${retDepNote}; 4+ hrs in ${destCountry} (departed at/after 04:00 local), ${destCountry} DA applied${arrNote}`
              : `${asgnTag} — return day${arrNote}`;
      } else if (isOvernightArrival) {
        // Overnight return flight: trainer landed in India on this day
        const asgnTag2 = asgn?.assignmentId ? `Asgn #${asgn.assignmentId}` : (asgn?.courseName || '—');
        // Prefer the leg that actually arrives FROM abroad (international leg) over any same-day
        // domestic onward flight that also happens to land this date — .find() alone would pick
        // whichever the PMS API array order lists first, not necessarily the right one.
        const retFltArrCandidates = activeFlights.filter(f => {
          const ad = parseDT(f.arrival_date);
          return ad ? ad === iso : false;
        });
        const retFltArr = retFltArrCandidates.find(f => inferCountryFromCity((f.from_city || '').trim()) !== 'India')
          ?? retFltArrCandidates.reduce((earliest, f) => {
            if (!earliest) return f;
            const et = (earliest.arrival_time || '').substring(0, 5);
            const ft = (f.arrival_time || '').substring(0, 5);
            return ft < et ? f : earliest;
          }, undefined as typeof activeFlights[0] | undefined);
        const overnightArrHHMM = retFltArr
          ? (retFltArr.arrival_time || '').substring(0, 5)
          : (flightArrTime.get(asgn?.endDate || '') || '');
        const arrNote3 = overnightArrHHMM ? `, arrived ${overnightArrHHMM}` : '';
        if (overnightArrHHMM && overnightArrHHMM < '12:00') {
          // Arrived before working hours — no DA for this day
          status      = 'Not Eligible — Early Arrival (Before 12:00)';
          statusClass = 'bg-gray-100 text-gray-500';
          amount      = 0;
          remarks = `${asgnTag2} — arrived back in India at ${overnightArrHHMM} (before 12:00); no DA for arrival day`;
        } else {
          status      = 'Allowed (Arrived in India)';
          statusClass = 'bg-green-100 text-green-700';
          amount      = rate;
          remarks = `${asgnTag2} — arrived back in India after overnight flight${arrNote3}; India DA applied`;
        }
      } else if (isOvernightDepArrival) {
        // Overnight outbound connecting flight: trainer arrived at destination on this day
        // (e.g. Bangkok → Sydney departs 02 Aug, arrives Sydney 03 Aug → 03 Aug = Australia DA)
        const asgnTagDep = asgn?.assignmentId ? `Asgn #${asgn.assignmentId}` : (asgn?.courseName || '—');
        const connFlt = activeFlights.find(f => {
          const ad = parseDT(f.arrival_date);
          return ad ? ad === iso : false;
        });
        const depArrHHMM = connFlt ? (connFlt.arrival_time || '').substring(0, 5) : '';
        const depArrNote = depArrHHMM ? `, arrived ${depArrHHMM}` : '';
        status      = `Allowed (Arrived in ${destCountry})`;
        statusClass = 'bg-green-100 text-green-700';
        amount      = rate;
        remarks     = `${asgnTagDep} — arrived in ${destCountry} via overnight connecting flight${depArrNote}; ${destCountry} DA applied`;
      } else if (isInterim) {
        // Policy: days between departure flight and batch start (pre-batch transit),
        // or between batch end and return flight (post-batch holding), are eligible for DA.
        // Trainer is abroad during these days → destination country rate applies.
        // (Delays are not considered per policy — scheduled times only.)
        const isPostBatch = iso > (asgn?.endDate || toDate);
        status      = isPostBatch ? 'Allowed (Post-Batch In-Country)' : 'Allowed (Pre-Batch In-Country)';
        statusClass = 'bg-teal-50 text-teal-700 border border-teal-200';
        amount      = rate;
        remarks     = isPostBatch
          ? `${asgnTag} — in ${destCountry} awaiting return flight (destination rate)`
          : `${asgnTag} — arrived in ${destCountry} before batch start (destination rate)`;
      } else if (isToday) {
        status      = 'Allowed (Today)';
        statusClass = 'bg-green-100 text-green-700';
        amount      = rate;
        remarks     = asgnTag;
      } else {
        status      = 'Allowed';
        statusClass = 'bg-green-100 text-green-700';
        amount      = rate;
        remarks     = asgnTag;
      }

      if (gapCountryOverrideNote) {
        remarks = `${remarks} [Corrected: ${gapCountryOverrideNote} DA — same-country weekend/gap day between consecutive assignments, no flight data on file]`;
      }

      return { iso, day: dayName(iso), country, assignmentId: asgnId, courseName: asgnCourse, status, statusClass, rate, currency, amount, remarks };
    });
  }, [fetched, fromDate, toDate, today, assignments, primaryCountry, leaveDates, pmsFlights, pmsAccom, lodgingEntries]);

  // Live FX rates (fetched on mount from /api/fx-rates); falls back to fxRates state
  const FX_TO_INR = fxRates;

  // INR-only DA total (used in grandTotal and INR displays)
  const autoDATotal = useMemo(
    () => daRows.filter(r => r.currency === 'INR').reduce((s, r) => s + r.amount, 0),
    [daRows],
  );
  // Foreign currency DA totals keyed by currency code
  const foreignDAMap = useMemo<Record<string, number>>(
    () => daRows.filter(r => r.currency !== 'INR' && r.amount > 0).reduce<Record<string, number>>((acc, r) => {
      acc[r.currency] = (acc[r.currency] ?? 0) + r.amount;
      return acc;
    }, {}),
    [daRows],
  );
  // Foreign DA converted to INR equivalent (for grand total)
  const foreignDATotalINR = useMemo(
    () => Object.entries(foreignDAMap).reduce((sum, [cur, amt]) => sum + amt * (FX_TO_INR[cur] ?? 0), 0),
    [foreignDAMap],
  );
  const travelTotal = useMemo(
    () => travelBills.reduce((s, b) => {
      const inr = b.currency && b.currency !== 'INR' ? b.amount * (FX_TO_INR[b.currency] ?? 0) : b.amount;
      return s + inr;
    }, 0),
    [travelBills, FX_TO_INR],
  );
  // Converts each expense to INR at the live FX rate before summing — mirrors
  // travelTotal above. A foreign-currency amount must never be added to an INR sum
  // as if it were the same currency (e.g. USD -200 is not INR -200).
  const miscTotal = useMemo(
    () => miscExpenses.reduce((s, e) => {
      const inr = e.currency && e.currency !== 'INR' ? e.amount * (FX_TO_INR[e.currency] ?? 0) : e.amount;
      return s + inr;
    }, 0),
    [miscExpenses, FX_TO_INR],
  );
  // Grouped by currency — a MYR 7 expense must show as "MYR 7", not be silently
  // relabelled with a rupee symbol by summing it into one INR-formatted number.
  const miscTotalsByCurrency = useMemo(() => {
    const map: Record<string, number> = {};
    miscExpenses.forEach(e => {
      const cur = (e.currency || 'INR').toUpperCase();
      map[cur] = (map[cur] ?? 0) + e.amount;
    });
    return map;
  }, [miscExpenses]);
  const lodgingTotal = useMemo(() => lodgingEntries.reduce((s, l) => s + l.nights * l.ratePerNight, 0), [lodgingEntries]);
  // Grand total includes foreign DA converted to INR at indicative rates
  const grandTotal = autoDATotal + foreignDATotalINR + travelTotal + lodgingTotal + miscTotal;

  function addTravelBill() {
    if (!travelDraft.from || !travelDraft.to || !travelDraft.amount) return;
    if (!travelDraft.journeyType) return;
    if (!travelDraft.receiptData || travelDraft.receiptData === '…uploading') return;
    const validation = validateJourneyType(travelDraft.journeyType, travelDraft.date || '', assignments, empCode);
    if (validation.blocked) return;
    setTravelBills(prev => [...prev, { ...travelDraft, id: uid() } as TravelBill]);
    setTravelDraft({ date: fromDate || '', journeyType: '', travelType: 'Cab', from: '', to: '', distance: '', amount: 0, currency: 'INR', receipt: '' });
  }

  function removeTravelBill(id: string) {
    setTravelBills(prev => prev.filter(b => b.id !== id));
  }

  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Draft / Edit: restore from URL param on mount ───────────────────────
  useEffect(() => {
    const params = new URLSearchParams(location.search);

    // ── Edit mode: ?edit=claimId ─────────────────────────────────────────
    const editId = params.get('edit');
    if (editId) {
      editClaimIdRef.current = editId;
      // Fetch claim header from memory
      const claimHeader = getClaims().find(c => c.claimId === editId);
      if (claimHeader) {
        editBillNoRef.current = claimHeader.billNo ?? '';
        if (claimHeader.claimStartDate) setFromDate(claimHeader.claimStartDate);
        if (claimHeader.claimEndDate) setToDate(claimHeader.claimEndDate);
        if (claimHeader.adminRemark) setEmployeeRemarks(claimHeader.adminRemark);
      }
      // Fetch line items from Turso for this claim, then map back to wizard state
      fetch(`/api/turso?type=lineitems&claimId=${editId}`)
        .then(r => r.json())
        .then((data: { lineItems?: ClaimLineItem[] }) => {
          const items: ClaimLineItem[] = data.lineItems ?? [];
          const restoredTravel: TravelBill[] = [];
          const restoredMisc: MiscExpense[] = [];
          const restoredLodging: LodgingEntry[] = [];
          items.forEach(li => {
            if (li.expenseType === 'TA') {
              const rawId = li.lineItemId?.replace('LI-TA-', '') || uid();
              restoredTravel.push({
                id: rawId,
                date: li.date ?? '',
                journeyType: li.expenseSubType ?? '',
                travelType: li.expenseSubType ?? 'Cab',
                from: li.fromLocation ?? '',
                to: li.toLocation ?? '',
                distance: '',
                amount: li.claimedAmount ?? 0,
                currency: li.currency ?? 'INR',
                receipt: li.receiptFileName ?? '',
                receiptData: li.receiptData ?? '',
              });
            } else if (li.expenseType === 'Other') {
              const rawId = li.lineItemId?.replace('LI-MI-', '') || uid();
              const desc = li.description ?? '';
              const colonIdx = desc.indexOf(':');
              const remarks = colonIdx >= 0 ? desc.slice(colonIdx + 1).trim() : '';
              restoredMisc.push({
                id: rawId,
                expenseType: li.expenseSubType ?? 'Other',
                date: li.date ?? '',
                amount: li.claimedAmount ?? 0,
                currency: li.currency ?? 'INR',
                remarks,
                receipt: li.receiptFileName ?? '',
                receiptData: li.receiptData ?? '',
              });
            } else if (li.expenseType === 'Lodging') {
              const rawId = li.lineItemId?.replace('LI-LO-', '') || uid();
              // Parse "Hotel: Name, City (N night(s))" from description
              const descMatch = (li.description ?? '').match(/^Hotel:\s*([^,]+),\s*([^(]+)\((\d+)\s*night/);
              const hotelName = descMatch ? descMatch[1].trim() : '';
              const city = descMatch ? descMatch[2].trim() : (li.toLocation ?? '');
              const nights = descMatch ? parseInt(descMatch[3], 10) : 1;
              const rate = nights > 0 ? Math.round((li.claimedAmount ?? 0) / nights) : (li.claimedAmount ?? 0);
              restoredLodging.push({
                id: rawId,
                hotelName,
                city,
                roomNo: '',
                checkIn: li.date ?? '',
                checkOut: '',
                nights,
                ratePerNight: rate,
                receipt: li.receiptFileName ?? '',
                source: 'manual',
                stayType: 'Hotel' as LodgingStayType,
              });
            }
          });
          if (restoredTravel.length) setTravelBills(restoredTravel);
          if (restoredMisc.length) setMiscExpenses(restoredMisc);
          if (restoredLodging.length) setLodgingEntries(restoredLodging);
        })
        .catch(() => { /* silently ignore — trainer can re-add items */ });
      return; // skip draft restore when in edit mode
    }

    // ── Draft mode: ?draft=claimId ───────────────────────────────────────
    const draftId = params.get('draft');
    if (!draftId) return;
    try {
      const drafts = getDraftClaims();
      const draft = drafts.find(d => d.claimId === draftId);
      if (!draft?.draftWizardData) return;
      const wz = JSON.parse(draft.draftWizardData) as {
        fromDate?: string; toDate?: string;
        assignments?: Assignment[]; leaveDates?: string[];
        travelBills?: TravelBill[]; lodgingEntries?: LodgingEntry[];
        miscExpenses?: MiscExpense[]; advances?: AdvanceTaken[];
        employeeRemarks?: string;
      };
      draftClaimIdRef.current = draftId;
      draftRestoredRef.current = true;
      if (wz.fromDate) setFromDate(wz.fromDate);
      if (wz.toDate) setToDate(wz.toDate);
      if (wz.assignments?.length) { setAssignments(wz.assignments); setFetched(true); }
      if (wz.leaveDates?.length) setLeaveDates(new Set(wz.leaveDates));
      if (wz.travelBills?.length) setTravelBills(wz.travelBills);
      if (wz.lodgingEntries?.length) setLodgingEntries(wz.lodgingEntries);
      if (wz.miscExpenses?.length) setMiscExpenses(wz.miscExpenses);
      if (wz.advances?.length) setAdvances(wz.advances);
      if (wz.employeeRemarks) setEmployeeRemarks(wz.employeeRemarks);
      // The draft's saved leave days are a snapshot; restoring its dates triggers the
      // leave refresh effect above, which re-pulls PMS and drops cancelled leaves.
    } catch { /* corrupt draft — ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Draft: auto-save every time meaningful state changes ─────────────────
  useEffect(() => {
    // Only save if trainer has started the form (at minimum selected dates)
    if (!fromDate || isProxyMode) return;
    const timer = setTimeout(() => {
      try {
        const wizardData = JSON.stringify({
          fromDate, toDate,
          assignments,
          leaveDates: Array.from(leaveDates),
          travelBills,
          lodgingEntries,
          miscExpenses,
          advances,
          employeeRemarks,
        });
        const now = new Date().toISOString();
        const draft: import('../types').ClaimHeader = {
          claimId: draftClaimIdRef.current,
          billNo: `DRAFT-${draftClaimIdRef.current.slice(-6)}`,
          trainerId: currentUser?.trainerId || currentUser?.id || '',
          trainerName: currentUser?.name || '',
          trainerEmail: currentUser?.email || undefined,
          assignmentIds: assignments.map(a => a.assignmentId).filter(Boolean),
          batchIds: [],
          clientName: assignments[0]?.clientName || '',
          courseName: assignments[0]?.courseName || '',
          trainingLocation: assignments.map(a => a.city || a.country).filter(Boolean).join(', '),
          claimStartDate: fromDate,
          claimEndDate: toDate || fromDate,
          baseCity: 'India',
          destinationCities: [...new Set(assignments.map(a => a.country).filter(Boolean))],
          status: 'Draft',
          pendingWith: 'Trainer',
          lastActionAt: now,
          totalClaimedAmount: 0,
          eligibleAmount: 0,
          approvedAmount: 0,
          deductionAmount: 0,
          advanceAdjusted: 0,
          miscAdjustments: 0,
          recoverableAmount: 0,
          netPayable: 0,
          currency: 'INR',
          exceptionFlag: false,
          missingDocumentFlag: false,
          duplicateFlag: false,
          ledgerMismatchFlag: false,
          slaBreached: false,
          paymentStatus: 'Unpaid',
          agingDays: 0,
          draftWizardData: wizardData,
        };
        saveDraftClaim(draft);
      } catch { /* storage full — silent */ }
    }, 2000); // 2-second debounce
    return () => clearTimeout(timer);
  }, [fromDate, toDate, assignments, leaveDates, travelBills, lodgingEntries, miscExpenses, advances, employeeRemarks, currentUser, isProxyMode]);

  async function handleSubmit() {
    const stillUploading = travelBills.some(b => b.receiptData === '…uploading') || miscExpenses.some(m => m.receiptData === '…uploading');
    if (stillUploading) { setSubmitError('Please wait — file attachments are still uploading.'); return; }

    // Strict receipt enforcement — block submission if ANY travel bill or misc expense is missing a
    // receipt. Exempt flights auto-imported from PMS (source: 'pms') — the booking is already a
    // verified travel-desk record, and many PMS flight records have no ticket_path on file at all
    // (a data gap on Koenig's side, not something the trainer can supply). Requiring the trainer to
    // remove and somehow re-attach a receipt for a ticket they never personally booked/paid for
    // made it impossible to submit at all. Bug fixed 2026-08-31: Sagnik Ghosh blocked from
    // submitting by "4 travel bill(s) are missing a receipt" — all 4 were PMS-imported flights.
    const travelMissingReceipt = travelBills.filter(b => b.source !== 'pms' && (!b.receiptData || b.receiptData === '…uploading'));
    const miscMissingReceipt = miscExpenses.filter(m => !m.receiptData || m.receiptData === '…uploading');
    if (travelMissingReceipt.length > 0) {
      setSubmitError(`Receipt is mandatory: ${travelMissingReceipt.length} travel bill(s) are missing a receipt. Please remove them and re-add with a receipt attached.`);
      return;
    }
    if (miscMissingReceipt.length > 0) {
      setSubmitError(`Receipt is mandatory: ${miscMissingReceipt.length} miscellaneous expense(s) are missing a receipt. Please remove them and re-add with a receipt attached.`);
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    const now = new Date().toISOString();
    const isEditMode = !!editClaimIdRef.current;
    const claimId = isEditMode ? editClaimIdRef.current : `CLAIM-${Date.now()}`;
    let billNo = editBillNoRef.current;
    if (!isEditMode) {
      // Reserve the next sequential bill number for this year — atomic on the server,
      // so two trainers submitting at the same instant never collide. Falls back to the
      // old timestamp-suffix scheme only if the reservation call itself fails, so
      // submission is never blocked by this.
      const billYear = new Date().getFullYear();
      try {
        const seqRes = await fetch('/api/turso?type=next-bill-no', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year: billYear }),
        });
        if (!seqRes.ok) throw new Error(`HTTP ${seqRes.status}`);
        const { seq } = await seqRes.json();
        billNo = `TADA-${billYear}-${String(seq).padStart(5, '0')}`;
      } catch {
        billNo = `TADA-${billYear}-${String(Date.now()).slice(-5)}`;
      }
    }

    // Build advanceItems: all PMS advances in range + manually added advances
    const advanceItems: ClaimAdvanceItem[] = [
      ...pmsAdvancesInRange.map(r => ({
        key:       String(r.TABillID ?? `${r.Date}-${r.Amount}`),
        date:      parseDT(r.Date) || fromDate,
        amount:    Number(r.Amount ?? 0),
        currency:  r.Currency?.toUpperCase() || 'INR',
        type:      r.Type || '',
        taBillId:  r.TABillID && r.TABillID !== '0' ? `BILL-${r.TABillID}` : '',
        narration: String(r.Narration ?? ''),
        source:    'pms' as const,
      })),
      ...advancesInRange.filter(a => !pmsAdvancesInRange.some(
        r => String(r.TABillID ?? `${r.Date}-${r.Amount}`) === a.reference || a.reference === `BILL-${r.TABillID}`
      )).map(a => ({
        key:       a.id,
        date:      a.date,
        amount:    a.amount,
        currency:  a.currency,
        type:      a.purpose,
        taBillId:  a.reference,
        narration: '',
        source:    'manual' as const,
      })),
    ];

    // Build ClaimHeader
    const claim: ClaimHeader = {
      claimId,
      billNo,
      trainerId: currentUser?.trainerId || currentUser?.id || '',
      trainerName: currentUser?.name || '',
      assignmentIds: assignments.map(a => a.assignmentId).filter(Boolean),
      batchIds: assignments.map(a => a.assignmentId).filter(Boolean),
      clientName: assignments[0]?.clientName || '',
      courseName: assignments[0]?.courseName || '',
      trainingLocation: assignments.map(a => a.city || a.country).filter(Boolean).join(', '),
      claimStartDate: fromDate,
      claimEndDate: toDate,
      baseCity: 'India',
      destinationCities: [...new Set(assignments.map(a => a.country).filter(Boolean))],
      status: isEditMode ? 'Resubmitted' : 'Submitted',
      pendingWith: 'HR/Admin',
      submittedAt: now,
      lastActionAt: now,
      totalClaimedAmount: grandTotal,
      eligibleAmount: grandTotal,
      approvedAmount: 0,
      deductionAmount: 0,
      // advanceAdjusted must stay 0 at submission — it is an HR-only decision, made explicitly
      // via the "Deductions — Advance Taken" checkboxes in ClaimDetail.tsx's persistAction, never
      // auto-applied. advanceTotal here is only ever a blanket sum of every INR advance found in
      // the PMS date range (line ~4708) — shown to the trainer as an informational preview, but
      // storing it as the claim's actual advanceAdjusted meant a brand-new "Submitted" claim
      // (never touched by HR) already carried a real deduction and could show a false Recoverable
      // amount before HR had reviewed anything. Bug fixed 2026-08-27: Saurabh Kohli EMP-3922,
      // TADA-2026-00091 — advanceAdjusted was 75,000 with 0 boxes checked in the HR panel.
      advanceAdjusted: 0,
      miscAdjustments: 0,
      recoverableAmount: 0,
      netPayable: grandTotal,
      currency: 'INR',
      exceptionFlag: false,
      missingDocumentFlag: false,
      duplicateFlag: false,
      ledgerMismatchFlag: false,
      slaBreached: false,
      paymentStatus: 'Unpaid',
      agingDays: 0,
      adminRemark: employeeRemarks || undefined,
      trainerEmail: currentUser?.email || undefined,
      advanceItems,
    };

    // Build ClaimLineItems
    const lineItems: ClaimLineItem[] = [];

    // DA rows
    daRows.filter(r => r.amount > 0).forEach(r => {
      lineItems.push({
        lineItemId: `LI-DA-${claimId}-${r.iso}`,
        claimId,
        expenseType: 'DA',
        expenseSubType: r.country,
        date: r.iso,
        description: `Daily Allowance — ${r.country} (${r.status})`,
        claimedAmount: r.amount,
        policyLimit: r.rate,
        eligibleAmount: r.amount,
        approvedAmount: 0,
        deductionAmount: 0,
        currency: r.currency,
        receiptRequired: false,
        receiptUploaded: false,
        exceptionRequired: false,
      });
    });

    // Travel bills
    travelBills.forEach(b => {
      lineItems.push({
        lineItemId: `LI-TA-${b.id}`,
        claimId,
        expenseType: 'TA',
        expenseSubType: b.travelType,
        date: b.date,
        fromLocation: b.from,
        toLocation: b.to,
        description: `${b.journeyType || b.travelType}: ${b.from} → ${b.to}${b.distance ? ` (${b.distance})` : ''}`,
        claimedAmount: b.amount,
        policyLimit: b.amount,
        eligibleAmount: b.amount,
        approvedAmount: 0,
        deductionAmount: 0,
        currency: b.currency || 'INR',
        receiptRequired: true,
        receiptUploaded: !!b.receipt,
        exceptionRequired: false,
        ...(b.receipt ? { receiptFileName: b.receipt } : {}),
        ...(b.receiptData ? { receiptData: b.receiptData } : {}),
      });
    });

    // Lodging
    lodgingEntries.forEach(l => {
      lineItems.push({
        lineItemId: `LI-LO-${l.id}`,
        claimId,
        expenseType: 'Lodging',
        date: l.checkIn,
        description: `Hotel: ${l.hotelName || 'Accommodation'}, ${l.city} (${l.nights} night${l.nights !== 1 ? 's' : ''})`,
        claimedAmount: l.nights * l.ratePerNight,
        policyLimit: l.nights * l.ratePerNight,
        eligibleAmount: l.nights * l.ratePerNight,
        approvedAmount: 0,
        deductionAmount: 0,
        currency: 'INR',
        receiptRequired: true,
        receiptUploaded: !!l.receipt,
        exceptionRequired: false,
      });
    });

    // Misc expenses
    miscExpenses.forEach(m => {
      lineItems.push({
        lineItemId: `LI-MI-${m.id}`,
        claimId,
        expenseType: 'Other',
        expenseSubType: m.expenseType,
        date: m.date,
        description: `${m.expenseType}${m.remarks ? ': ' + m.remarks : ''}`,
        claimedAmount: m.amount,
        policyLimit: m.amount,
        eligibleAmount: m.amount,
        approvedAmount: 0,
        deductionAmount: 0,
        currency: m.currency || 'INR',
        receiptRequired: true,
        receiptUploaded: !!m.receipt,
        exceptionRequired: false,
        ...(m.receipt ? { receiptFileName: m.receipt } : {}),
        ...(m.receiptData ? { receiptData: m.receiptData } : {}),
      });
    });

    try {
      // In edit mode: delete old line items from Turso before inserting the updated set
      if (isEditMode) {
        await fetch(`/api/turso?type=lineitems&claimId=${claimId}`, { method: 'DELETE' });
      }

      // Upload every receipt to Vercel Blob BEFORE writing line items to Turso, replacing
      // the base64 with a small URL. Previously the bulk /api/turso?type=lineitems POST sent
      // ALL receipts as raw base64 in one request; a bill with a few photo receipts easily
      // exceeded Vercel's request body limit, the POST failed, and — because its response was
      // never checked — submission still reported success while HR Admin's copy of the claim
      // silently had zero receipt data (only the filename/flag survived via the claim's own
      // lightweight embedded copy). Uploading first keeps this payload tiny and reliable, and
      // checking the response below means a real failure now surfaces instead of being hidden.
      // Retry each upload once on a transient failure (network blip, cold-start timeout) — a
      // single flaky upload previously fell back to keeping that one receipt as base64, which
      // was often enough on its own to push the later bulk line-items POST back over Vercel's
      // request size limit.
      const uploadReceiptWithRetry = async (li: ClaimLineItem): Promise<ClaimLineItem> => {
        if (!li.receiptData || !li.receiptData.startsWith('data:')) return li;
        const contentType = li.receiptData.match(/^data:([^;]+);/)?.[1] ?? 'application/octet-stream';
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const r = await fetch('/api/turso?type=upload-receipt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ base64: li.receiptData, filename: li.receiptFileName || li.lineItemId, contentType }),
            });
            if (r.ok) {
              const { url } = await r.json() as { url?: string };
              if (url) return { ...li, receiptData: url, receiptUrl: url };
            }
          } catch { /* retry below, or fall through and keep base64 on final attempt */ }
        }
        return li;
      };
      const lineItemsWithUrls = await Promise.all(lineItems.map(uploadReceiptWithRetry));

      // Always persist to localStorage immediately — guarantees same-device visibility.
      saveClaim({ ...claim, lineItems: lineItemsWithUrls });
      saveLineItems(lineItemsWithUrls);

      // Write claim to Turso (stripped of base64 to keep the claims row small).
      const lineItemsForClaim = lineItemsWithUrls.map(({ receiptData: _r, ...rest }) => rest);
      const claimRes = await fetch('/api/turso?type=claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...claim, lineItems: lineItemsForClaim }),
      });
      if (!claimRes.ok) throw new Error('Failed to save claim. Please try again.');

      // Write line items to Turso — now URLs instead of base64 wherever the upload above
      // succeeded, so this payload stays small. Sent in small batches rather than one request
      // for the whole claim: a bill with many line items (e.g. an FMAT batch with a dozen+
      // training dates) can still add up even with receipts converted to URLs, and if even one
      // item's upload above fell back to base64 (upload-receipt itself down, not just a retry-
      // able blip), a single request carrying everything fails as a whole. Batching means only
      // the batch containing that item is affected, and each batch gets one retry on failure.
      const LINEITEM_BATCH_SIZE = 15;
      const failedBatches: number[] = [];
      for (let i = 0; i < lineItemsWithUrls.length; i += LINEITEM_BATCH_SIZE) {
        const batch = lineItemsWithUrls.slice(i, i + LINEITEM_BATCH_SIZE);
        let ok = false;
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {
          try {
            const liRes = await fetch('/api/turso?type=lineitems', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lineItems: batch }),
            });
            ok = liRes.ok;
          } catch { /* retry below, or record as failed after final attempt */ }
        }
        if (!ok) failedBatches.push(i / LINEITEM_BATCH_SIZE + 1);
      }
      if (failedBatches.length > 0) {
        throw new Error(`Claim saved, but some line items (receipts, DA, travel bills) failed to sync after retrying (batch ${failedBatches.join(', ')} of ${Math.ceil(lineItemsWithUrls.length / LINEITEM_BATCH_SIZE)}). Please try submitting again.`);
      }

      deleteDraftClaim(draftClaimIdRef.current);

      // Register this claim as a TA Bill header record in Koenig RMS (api_id=342).
      // Never blocks or fails the existing submission — this is additive registration
      // on top of the Turso save above, which remains the source of truth for this app.
      try {
        const empIdNum = Number((currentUser?.trainerId ?? '').replace(/^EMP-/i, '').trim());
        if (empIdNum) {
          const scidList = Array.from(new Set(assignments.map(a => a.scid).filter(Boolean))).join(',');
          const remarkParts: string[] = [];
          if (employeeRemarks.trim()) remarkParts.push(employeeRemarks.trim());
          remarkParts.push(
            `DA: ${formatINR(Math.round(autoDATotal + foreignDATotalINR))} | Travel: ${formatINR(Math.round(travelTotal))} | ` +
            `Lodging: ${formatINR(Math.round(lodgingTotal))} | Misc: ${formatINR(Math.round(miscTotal))} | Grand Total: ${formatINR(Math.round(grandTotal))}`
          );

          // RMS "From"/"To" must reflect the trainer's ACTUAL travel window from flight data —
          // not the claim date range they happened to select in Step 1 — and must chase through
          // connecting legs (same class of fix as the DA travel/return-day logic above) rather
          // than stopping at the first leg's own date, so a transit layover never gets reported
          // as the real departure/arrival.
          const rmsActiveFlights = pmsFlights.filter(f => f.Is_cancelled !== 'Yes');
          const sortedAsgns = assignments.slice().sort((a, b) => (a.startDate || '') < (b.startDate || '') ? -1 : 1);
          const firstAsgn = sortedAsgns[0];
          const lastAsgn = sortedAsgns[sortedAsgns.length - 1];

          // Earliest outbound leg: the first flight departing in the days immediately before/on
          // the first assignment's start — chase BACKWARD through same/previous-day connecting
          // legs to find the leg that actually left India (or wherever the trainer started
          // from), not just the last, most-visible-in-the-window leg.
          let rmsFromDate = fromDate;
          if (firstAsgn?.startDate) {
            const outboundCandidates = rmsActiveFlights.filter(f => {
              const fd = parseDT((f.departure_date || '').trim());
              return fd ? fd >= addDays(firstAsgn.startDate!, -6) && fd <= firstAsgn.startDate! : false;
            });
            let earliestOutbound = outboundCandidates.length === 0 ? undefined
              : outboundCandidates.reduce((earliest, f) => {
                  const ed = parseDT((earliest.departure_date || '').trim()) || '';
                  const fd = parseDT((f.departure_date || '').trim()) || '';
                  if (fd < ed) return f;
                  if (fd > ed) return earliest;
                  return (f.departure_time || '').substring(0, 5) < (earliest.departure_time || '').substring(0, 5) ? f : earliest;
                });
            // Chase backward through connecting legs — a leg whose from_city matches an
            // earlier leg's to_city, departing within 2 days before, is the same journey.
            for (let hop = 0; hop < 5 && earliestOutbound; hop++) {
              const curFromCity = (earliestOutbound.from_city || '').trim().toLowerCase();
              const curDepDate = parseDT((earliestOutbound.departure_date || '').trim());
              const prevLeg = rmsActiveFlights.find(f => {
                if (f === earliestOutbound) return false;
                const toCity = (f.to_city || '').trim().toLowerCase();
                const fd = parseDT((f.departure_date || '').trim());
                return !!toCity && toCity === curFromCity && !!fd && fd <= curDepDate && fd >= addDays(curDepDate, -2);
              });
              if (!prevLeg) break;
              earliestOutbound = prevLeg;
            }
            if (earliestOutbound) rmsFromDate = parseDT((earliestOutbound.departure_date || '').trim()) || fromDate;
          }

          // Final return arrival: the earliest return leg departing FROM the last assignment's
          // destination after it ends, then chase FORWARD through connecting legs — stopping
          // the instant a leg lands in India (that's "home"; a later flight from that same city
          // days afterward belongs to a different trip, not this connection) and capping each
          // hop to a 2-day window so an unrelated future trip can never be picked up.
          let rmsToDate = toDate;
          if (lastAsgn?.endDate) {
            const destCountryLast = (lastAsgn.country === 'India' && lastAsgn.city ? inferCountryFromCity(lastAsgn.city) : lastAsgn.country) || inferCountryFromCity(lastAsgn.city || '');
            // Widened from +5 to +45 days: a return flight is often rebooked (original ticket
            // cancelled, a later one issued) well past the assignment's original end date. Bug
            // fixed 2026-08-21: Kshitiz Raghuvanshi EMP-2707 -- assignment ended 31 Jul, but the
            // original 01 Aug return was cancelled and rebooked to 15 Aug (14 days later); the
            // +5 day window missed it entirely, so this claim registered with the wrong dates.
            // Picking the EARLIEST active flight departing from destCountryLast within this
            // window still correctly identifies the real return leg rather than a later
            // unrelated trip, since a genuinely different assignment's own flights would need to
            // depart from the SAME country even sooner to be picked up in error.
            const returnCandidates = rmsActiveFlights.filter(f => {
              const fd = parseDT((f.departure_date || '').trim());
              return fd ? fd >= lastAsgn.endDate! && fd <= addDays(lastAsgn.endDate!, 45)
                && (!destCountryLast || inferCountryFromCity((f.from_city || '').trim()) === destCountryLast) : false;
            });
            let returnLeg = returnCandidates.length === 0 ? undefined
              : returnCandidates.reduce((earliest, f) => {
                  const ed = parseDT((earliest.departure_date || '').trim()) || '';
                  const fd = parseDT((f.departure_date || '').trim()) || '';
                  if (fd < ed) return f;
                  if (fd > ed) return earliest;
                  return (f.departure_time || '').substring(0, 5) < (earliest.departure_time || '').substring(0, 5) ? f : earliest;
                });
            for (let hop = 0; hop < 5 && returnLeg; hop++) {
              const curToCity = (returnLeg.to_city || '').trim().toLowerCase();
              const curCountry = inferCountryFromCity((returnLeg.to_city || '').trim());
              if (curCountry === 'India') break;
              const curArrDate = parseDT((returnLeg.arrival_date || '').trim()) || parseDT((returnLeg.departure_date || '').trim());
              const nextLeg = rmsActiveFlights.find(f => {
                if (f === returnLeg) return false;
                const fromCity = (f.from_city || '').trim().toLowerCase();
                const fd = parseDT((f.departure_date || '').trim());
                return !!fromCity && fromCity === curToCity && !!fd && fd >= curArrDate && fd <= addDays(curArrDate, 2);
              });
              if (!nextLeg) break;
              returnLeg = nextLeg;
            }
            if (returnLeg) {
              const arrDate = parseDT((returnLeg.arrival_date || '').trim()) || parseDT((returnLeg.departure_date || '').trim());
              if (arrDate) rmsToDate = arrDate;
            }
          }

          // Reuse an existing RMS TA Bill instead of creating a new one when another claim by
          // this same trainer already registered essentially the same journey. Without this, a
          // trainer submitting several separate bills that all cover part of one trip (e.g. DA
          // in one bill, misc expenses in another) registered a SEPARATE RMS record for each —
          // RMS flagged this directly: "For one round journey, we should receive a single claim
          // entry" (2026-08-21), and confirmed by example: 5 separate TABillIDs for one trainer
          // all on assignment 264822.
          //
          // 2026-08-23 (Prem Sharma EMP-1563): tried requiring the two claims' assignment-ID SETS
          // to be EXACTLY equal, to stop a combined multi-assignment claim from acting as a "hub"
          // that transitively links unrelated single-assignment claims. That over-corrected: per
          // explicit instruction ("check assignment ID, create only one TABillID, without fail"),
          // ANY claim covering a given assignment ID must reuse THAT assignment ID's one TABillID
          // — a combined claim [X,Y,Z] and later separate claims for X, for Y, and for Z should
          // all land on the SAME TABillID, because X, Y, and Z were already billed together.
          // Exact-set-equality broke exactly that: Sreemanta Das (asgn 262076), Prajakta Landge
          // (asgn 265287/266254/265289), each got 3-4 separate TABillIDs instead of one, because
          // no later single-assignment claim's set ever equaled the earlier combined claim's set.
          // Reverted 2026-08-31 to the simple, correct rule: reuse the TABillID of ANY other claim
          // that shares AT LEAST ONE assignment ID. Falls back to overlapping travel dates only
          // when no assignment-ID data exists on either side.
          let reusedTABillId: number | null = null;
          try {
            const otherClaimsRes = await fetch(`/api/turso?type=claims&trainerId=${encodeURIComponent(String(currentUser?.trainerId ?? ''))}`);
            if (otherClaimsRes.ok) {
              const { claims: otherClaims } = await otherClaimsRes.json() as { claims?: Array<{ claimId: string; assignmentIds?: string[]; claimStartDate?: string; claimEndDate?: string; rmsTABillId?: number }> };
              const thisAsgnIds = new Set((claim.assignmentIds ?? []).map(String));
              const others = (otherClaims ?? []).filter(c => c.claimId !== claimId && c.rmsTABillId);
              const shareAnyAssignment = (a: Set<string>, b: Set<string>) => a.size > 0 && [...a].some(x => b.has(x));
              const asgnMatch = others.find(c => shareAnyAssignment(new Set((c.assignmentIds ?? []).map(String)), thisAsgnIds));
              // Date-overlap fallback only for claims with NO assignment-ID data at all on either
              // side — never used to bridge two claims with different known assignment IDs.
              const dateMatch = !asgnMatch && thisAsgnIds.size === 0 ? others.find(c => {
                const cAsgnIds = new Set((c.assignmentIds ?? []).map(String));
                if (cAsgnIds.size > 0) return false;
                return c.claimStartDate && c.claimEndDate &&
                  c.claimStartDate <= (claim.claimEndDate || rmsToDate) && (claim.claimStartDate || rmsFromDate) <= c.claimEndDate;
              }) : undefined;
              const match = asgnMatch ?? dateMatch;
              if (match?.rmsTABillId) reusedTABillId = match.rmsTABillId;
            }
          } catch { /* dedup check is best-effort — fall through to creating a new record */ }

          // api_id=354 (Koenig "Upsert TA Bill") decides Create vs Update purely on whether
          // TABillID is passed: omit it to insert a new RMS record, pass an existing one to
          // update ONLY its Advance/TADAAmt in place. Reopening/resubmitting the SAME assignment
          // must always land on the SAME TABillID (per explicit instruction), but the updated
          // claim/advance amount must still reach RMS — previously this branch skipped the RMS
          // call entirely on reuse, so RMS silently kept the FIRST submission's stale amount
          // forever even after the trainer added more expenses or HR adjusted an advance. Bug
          // fixed 2026-08-25 per Koenig's Upsert_TABill_API_Guide.
          const rmsRes = await fetch('/api/turso?type=create-tabill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              TABillID: reusedTABillId || undefined,
              EmpID: empIdNum,
              From: `${rmsFromDate} 00:00:00`,
              To: `${rmsToDate} 23:59:59`,
              IsSubmitted: 1,
              Advance: advanceTotal || 0,
              TADAAmt: grandTotal || 0,
              EmpRemark: remarkParts.join(' — ').slice(0, 4000),
              scids: scidList || undefined,
            }),
          });
          if (rmsRes.ok) {
            const rmsData = await rmsRes.json();
            if (rmsData.TABillID) {
              saveClaim({ ...claim, lineItems: lineItemsWithUrls, rmsTABillId: rmsData.TABillID } as import('../types').ClaimHeader);
              fetch('/api/turso?type=claims', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...claim, lineItems: lineItemsForClaim, rmsTABillId: rmsData.TABillID }),
              }).catch(() => {});
            }
          } else if (reusedTABillId) {
            // RMS call failed but we already know the correct TABillID to reuse locally —
            // still tag the claim with it so the dashboard stays internally consistent even if
            // the RMS sync retries later.
            saveClaim({ ...claim, lineItems: lineItemsWithUrls, rmsTABillId: reusedTABillId } as import('../types').ClaimHeader);
            fetch('/api/turso?type=claims', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...claim, lineItems: lineItemsForClaim, rmsTABillId: reusedTABillId }),
            }).catch(() => {});
          }
        }
      } catch {
        // RMS registration is additive — a failure here must never block or roll back
        // the claim submission that already succeeded above.
      }

      setSubmitSuccess(true);
      setTimeout(() => { navigate('/claims'); }, 1800);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function addMiscExpense() {
    if (!miscDraft.amount) return;
    setMiscExpenses(prev => [...prev, { ...miscDraft, id: uid() } as MiscExpense]);
    setMiscDraft({ expenseType: 'Other', date: fromDate || '', amount: 0, currency: 'INR', remarks: '', receipt: '' });
  }

  function removeMiscExpense(id: string) {
    setMiscExpenses(prev => prev.filter(e => e.id !== id));
  }

  function addAdvance() {
    if (!advanceDraft.amount || !advanceDraft.date) return;
    setAdvances(prev => [...prev, { ...advanceDraft, id: uid() } as AdvanceTaken]);
    setAdvanceDraft({ date: fromDate || '', amount: 0, currency: 'INR', purpose: '', reference: '' });
  }
  function removeAdvance(id: string) { setAdvances(prev => prev.filter(a => a.id !== id)); }

  function importAdvance(r: RawAdvanceRecord) {
    const key = String(r.TABillID ?? `${r.Date}-${r.Amount}`);
    if (importedAdvanceIds.has(key)) return;
    const entry: AdvanceTaken = {
      id: uid(),
      date: parseDT(r.Date) || (fromDate || ''),
      amount: Number(r.Amount ?? 0),
      currency: r.Currency?.toUpperCase() || 'INR',
      purpose: r.Type || '',
      reference: r.TABillID && r.TABillID !== '0' ? `BILL-${r.TABillID}` : '',
    };
    setAdvances(prev => [...prev, entry]);
    setImportedAdvanceIds(prev => new Set(prev).add(key));
  }

  const advancesInRange = advances.filter(a => a.date >= fromDate && a.date <= toDate);
  const advanceTotal = advancesInRange.filter(a => a.currency === 'INR').reduce((s, a) => s + a.amount, 0);

  // Strict filter: only advances whose date falls within the selected date range (Step 1)
  const pmsAdvancesInRange = pmsAdvances.filter(r => {
    if (!r.Amount || Number(r.Amount) === 0) return false;
    const d = parseDT(r.Date);
    if (!d) return false;
    return d >= fromDate && d <= toDate;
  });

  function importFlightAsBill(f: FlightRecord) {
    const tripKey = String(f.trip_ID ?? `${f.flight_number}-${parseDT(f.departure_date)}`);
    if (importedTripIds.has(tripKey)) return;
    const bill: TravelBill = {
      id: uid(),
      date: parseDT(f.departure_date),
      journeyType: '',
      travelType: 'Flight',
      from: f.from_city ?? '',
      to: f.to_city ?? '',
      distance: '',
      amount: 0,
      currency: 'INR',
      receipt: f.ticket_path ?? '',
      source: 'pms',
    };
    setTravelBills(prev => [...prev, bill]);
    setImportedTripIds(prev => new Set([...prev, tripKey]));
  }

  function calcNights(ci: string, co: string): number {
    if (!ci || !co) return 0;
    return Math.max(0, Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000));
  }

  function addLodgingEntry() {
    if (!lodgingDraft.hotelName || !lodgingDraft.checkIn || !lodgingDraft.checkOut) return;
    const nights = calcNights(lodgingDraft.checkIn, lodgingDraft.checkOut);
    const stayType = lodgingDraft.stayType ?? inferStayType(lodgingDraft.hotelName ?? '');
    setLodgingEntries(prev => [...prev, {
      ...lodgingDraft,
      id: uid(),
      nights,
      ratePerNight: lodgingDraft.ratePerNight ?? 0,
      stayType,
      source: 'manual',
    } as LodgingEntry]);
    setLodgingDraft({ hotelName: '', city: '', roomNo: '', checkIn: fromDate, checkOut: '', nights: 0, ratePerNight: 0, receipt: '', stayType: 'Other' });
  }

  function removeLodgingEntry(id: string) {
    setLodgingEntries(prev => prev.filter(l => l.id !== id));
  }

  function importAccomAsLodging(r: AccommodationRecord) {
    const key = `${r.AccommodationName}-${accomDT(r.CheckInDate)}`;
    if (importedAccom.has(key)) return;
    const ci = accomDT(r.CheckInDate);
    const co = accomDT(r.CheckOutDate);
    const nights = r.Nights ?? calcNights(ci, co);
    setLodgingEntries(prev => [...prev, {
      id: uid(),
      hotelName: r.AccommodationName ?? '',
      city: r.CityName ?? '',
      roomNo: r.RoomNo ?? '',
      checkIn: ci,
      checkOut: co,
      nights,
      ratePerNight: 0,
      receipt: r.AccommodationPDF ?? '',
      stayType: inferStayType(r.AccommodationName ?? ''),
      source: 'pms',
    }]);
    setImportedAccom(prev => new Set([...prev, key]));
  }

  function formatINR(n: number) {
    return `₹ ${n.toLocaleString('en-IN')}`;
  }

  function openAddModal() {
    setEditingAssignment(undefined);
    setModalOpen(true);
  }

  function openEditModal(a: Assignment) {
    setEditingAssignment(a);
    setModalOpen(true);
  }

  function saveAssignment(a: Assignment) {
    setAssignments(prev => {
      const idx = prev.findIndex(x => x.id === a.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = a;
        return next;
      }
      return [...prev, a];
    });
  }

  function removeAssignment(id: string) {
    setAssignments(prev => prev.filter(a => a.id !== id));
  }

  const isFutureRange = fromDate > today;
  const empCode = (currentUser?.trainerId ?? '').replace(/^EMP-/i, '').trim();

  return (
    <div className="min-h-screen bg-gray-50 pb-36">
      <AssignmentModal
        open={modalOpen}
        initial={editingAssignment}
        fromDate={fromDate}
        toDate={toDate}
        koenigCountries={koenigCountries}
        countriesLoading={countriesLoading}
        onSave={saveAssignment}
        onClose={() => setModalOpen(false)}
      />

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {/* Edit mode banner */}
        {editClaimIdRef.current && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800">Editing Existing Bill — {editBillNoRef.current}</p>
              <p className="text-xs text-amber-600">Your changes will overwrite the existing submission. On submit, the bill status will change to Resubmitted.</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Select Date Range</h1>
            <p className="text-sm text-gray-500 mt-0.5">Select date range to fetch assignments and auto-calculate DA per policy</p>
          </div>
          {currentUser && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {currentUser.avatarInitials}
              </div>
              <div>
                <p className="font-semibold text-blue-800">{currentUser.name}</p>
                <p className="text-xs text-blue-500">
                  EMP-{empCode} · {currentUser.email}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Section 1: Date Range ──────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <SectionTitle>Step 1 — Select Date Range &amp; Fetch Assignments</SectionTitle>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
              <div className="relative">
                <input type="date" className={inputCls} value={fromDate} max={today}
                  onChange={e => { setFromDate(e.target.value); setFetched(false); setFetchStatus('idle'); }} />
                <Calendar size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
              <div className="relative">
                <input type="date" className={inputCls} value={toDate} min={fromDate} max={today}
                  onChange={e => { setToDate(e.target.value); setFetched(false); setFetchStatus('idle'); }} />
                <Calendar size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleFetch}
                disabled={fetchLoading || !fromDate || !toDate || toDate < fromDate}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center gap-2"
              >
                {fetchLoading
                  ? <><Loader2 size={14} className="animate-spin" /> Fetching…</>
                  : <><Search size={14} /> Fetch Assignments</>}
              </button>

              {fetched && (
                <button
                  type="button"
                  onClick={openAddModal}
                  disabled={!fromDate || !toDate}
                  className="px-4 py-2.5 rounded-lg border-2 border-blue-600 text-blue-700 hover:bg-blue-50 disabled:opacity-40 text-sm font-semibold flex items-center gap-2"
                >
                  <Plus size={14} /> Add Assignment
                </button>
              )}
            </div>
          </div>

          {/* Status messages */}
          <div className="mt-3 flex flex-wrap gap-2">
            {isFutureRange && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium">
                <Info size={13} /> Future DA submission is not allowed.
              </div>
            )}
            {fetchStatus === 'success' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs font-medium">
                <CheckCircle2 size={13} /> {assignments.length} assignment{assignments.length !== 1 ? 's' : ''} fetched from Koenig PMS for EMP-{empCode}
              </div>
            )}
            {fetchStatus === 'empty' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
                <AlertCircle size={13} />
                No assignments found in PMS for EMP-{empCode} in this period. Use <strong className="ml-1">+ Add Assignment</strong> to add manually.
              </div>
            )}
            {fetchStatus === 'error' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                <AlertCircle size={13} className="flex-shrink-0" />
                <span>{fetchError}.</span>
                <button
                  type="button"
                  onClick={openAddModal}
                  disabled={!fromDate || !toDate}
                  className="ml-1 underline font-semibold hover:text-red-900 disabled:opacity-50 cursor-pointer"
                >
                  Add assignment manually →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Not fetched yet */}
        {!fetched && (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
            <Calendar size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">Select a date range and click <strong>Fetch Assignments</strong> to begin.</p>
            <p className="text-xs text-gray-400 mt-1">Assignment details, DA eligibility, and auto-calculation will appear here.</p>
          </div>
        )}

        {fetched && (
          <>
            {/* ── Section 2: Assignment Details ─────────────────────────────── */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div
                className="px-5 pt-4 pb-3 flex items-center justify-between flex-wrap gap-2 cursor-pointer select-none"
                onClick={() => setShowAssignmentTable(v => !v)}
              >
                <SectionTitle
                  badge={
                    <div className="flex items-center gap-2">
                      {assignments.length > 0 && (
                        <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2.5 py-0.5 rounded-full font-medium">
                          {assignments.length} assignment{assignments.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); openAddModal(); }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 border border-blue-300 hover:bg-blue-50"
                      >
                        <Plus size={12} /> Add
                      </button>
                      <span className="text-gray-400">{showAssignmentTable ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
                    </div>
                  }
                >
                  Step 2 — Assignment Details
                </SectionTitle>
              </div>

              {showAssignmentTable && (
                <>
                  {assignments.length === 0 ? (
                    <div className="px-5 pb-5">
                      {/* Empty state with prompt to add */}
                      <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-gray-200 rounded-xl">
                        <Building2 size={36} className="text-gray-300 mb-3" />
                        <p className="text-sm font-medium text-gray-500 mb-1">No assignments added yet</p>
                        <p className="text-xs text-gray-400 mb-4">Add your assignment details so DA can be calculated accurately</p>
                        <button
                          type="button"
                          onClick={openAddModal}
                          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"
                        >
                          <Plus size={14} /> Add Assignment
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      {/* Active filter chips */}
                      {(filterBatchType || filterMode) && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100">
                          <span className="text-xs text-blue-600 font-medium">Filters:</span>
                          {filterBatchType && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700 font-semibold">
                              Batch: {filterBatchType}
                              <button type="button" onClick={() => setFilterBatchType('')} className="ml-1 hover:text-purple-900">×</button>
                            </span>
                          )}
                          {filterMode && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-semibold">
                              Mode: {filterMode}
                              <button type="button" onClick={() => setFilterMode('')} className="ml-1 hover:text-green-900">×</button>
                            </span>
                          )}
                          <span className="text-xs text-gray-500 ml-auto">
                            {filteredAssignments.length} of {assignments.length} assignments
                          </span>
                          <button type="button" onClick={() => { setFilterBatchType(''); setFilterMode(''); }}
                            className="text-xs text-red-500 hover:underline">Clear all</button>
                        </div>
                      )}
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50 border-y border-gray-200">
                          <tr>
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">
                              <span className="flex items-center gap-1"><Calendar size={11} />Assignment ID</span>
                            </th>
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">
                              <span className="flex items-center gap-1"><Calendar size={11} />Batch ID</span>
                            </th>
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">
                              <span className="flex items-center gap-1"><Building2 size={11} />Course Name</span>
                            </th>
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">
                              <span className="flex items-center gap-1"><Building2 size={11} />Client Name</span>
                            </th>
                            {/* Batch Type column with filter */}
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">
                              <div className="flex flex-col gap-1">
                                <span className="flex items-center gap-1"><Calendar size={11} />Batch Type</span>
                                <select
                                  value={filterBatchType}
                                  onChange={e => setFilterBatchType(e.target.value)}
                                  className="text-[10px] border border-gray-300 rounded px-1 py-0.5 bg-white text-gray-600 font-normal focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-[80px]"
                                >
                                  <option value="">All</option>
                                  {batchTypeOptions.map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                              </div>
                            </th>
                            {/* Mode column with filter */}
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">
                              <div className="flex flex-col gap-1">
                                <span className="flex items-center gap-1"><Building2 size={11} />Mode</span>
                                <select
                                  value={filterMode}
                                  onChange={e => setFilterMode(e.target.value)}
                                  className="text-[10px] border border-gray-300 rounded px-1 py-0.5 bg-white text-gray-600 font-normal focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-[80px]"
                                >
                                  <option value="">All</option>
                                  {modeOptions.map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                              </div>
                            </th>
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">
                              <span className="flex items-center gap-1"><Calendar size={11} />Start Date</span>
                            </th>
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">
                              <span className="flex items-center gap-1"><Calendar size={11} />End Date</span>
                            </th>
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">
                              <span className="flex items-center gap-1"><MapPin size={11} />City of Training</span>
                            </th>
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">
                              <span className="flex items-center gap-1"><MapPin size={11} />Country</span>
                            </th>
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">
                              <span className="flex items-center gap-1"><Building2 size={11} />Training Venue</span>
                            </th>
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">
                              <span className="flex items-center gap-1"><Building2 size={11} />Trainer</span>
                            </th>
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">
                              <span className="flex items-center gap-1"><Calendar size={11} />SCID</span>
                            </th>
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">
                              <span className="flex items-center gap-1"><Building2 size={11} />Participants</span>
                            </th>
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">
                              <span className="flex items-center gap-1"><Calendar size={11} />Start Time</span>
                            </th>
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">
                              <span className="flex items-center gap-1"><Calendar size={11} />End Time</span>
                            </th>
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">Source</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredAssignments.map(a => (
                            <tr key={a.id} className="hover:bg-blue-50/30">
                              {/* Assignment ID */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                {a.assignmentId
                                  ? <span className="font-mono text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">{a.assignmentId}</span>
                                  : <span className="text-gray-400 text-[11px]">—</span>}
                              </td>
                              {/* Batch ID */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                {a.batchId
                                  ? <span className="font-mono text-[11px] text-violet-700 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded">{a.batchId}</span>
                                  : <span className="text-gray-400 text-[11px]">—</span>}
                              </td>
                              {/* Course Name */}
                              <td className="px-4 py-3 font-medium text-gray-800 max-w-[200px]">
                                <div className="truncate text-[12px]" title={a.courseName}>{a.courseName || '—'}</div>
                              </td>
                              {/* Client Name */}
                              <td className="px-4 py-3 max-w-[160px]">
                                {a.clientName
                                  ? <div className="truncate text-[11px] text-gray-700" title={a.clientName}>{a.clientName}</div>
                                  : <span className="text-gray-400 text-[11px]">—</span>}
                              </td>
                              {/* Batch Type (batch_delivery_mode) */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                {a.batchType ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700 w-fit">
                                    {a.batchType}
                                  </span>
                                ) : <span className="text-gray-400 text-[11px]">—</span>}
                              </td>
                              {/* Delivery Mode */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                {a.deliveryMode ? (() => {
                                  const isOnline = a.deliveryMode === 'Online';
                                  const isHybrid = a.deliveryMode === 'Hybrid';
                                  const colorCls = isOnline ? 'bg-green-100 text-green-700'
                                                 : isHybrid ? 'bg-blue-100 text-blue-700'
                                                 : 'bg-orange-100 text-orange-700';
                                  const dotCls   = isOnline ? 'bg-green-500'
                                                 : isHybrid ? 'bg-blue-500'
                                                 : 'bg-orange-500';
                                  return (
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${colorCls}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
                                      {a.deliveryMode}
                                    </span>
                                  );
                                })() : <span className="text-gray-400 text-[11px]">—</span>}
                              </td>
                              {/* Start Date */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                {a.startDate ? (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-teal-50 border border-teal-200 text-teal-800 font-semibold text-[11px]">
                                      {fmt(a.startDate)}
                                    </span>
                                    {!a.trainingDates && (
                                      <span className="text-[9px] text-amber-500 font-medium px-1">inferred</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-[11px]">—</span>
                                )}
                              </td>
                              {/* End Date */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                {a.endDate ? (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-orange-50 border border-orange-200 text-orange-800 font-semibold text-[11px]">
                                      {fmt(a.endDate)}
                                    </span>
                                    {!a.trainingDates && (
                                      <span className="text-[9px] text-amber-500 font-medium px-1">inferred</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-[11px]">—</span>
                                )}
                              </td>
                              {/* City of Training */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                {a.city
                                  ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium text-[11px]">
                                      <MapPin size={9} />{a.city}
                                    </span>
                                  : <span className="text-gray-400 text-[11px]">—</span>}
                              </td>
                              {/* Country — apply city override so London never shows India */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                {(() => { const effCountry = (a.country === 'India' && a.city) ? (inferCountryFromCity(a.city) || a.country) : (a.country || inferCountryFromCity(a.city)); return effCountry ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-medium text-[11px]">{effCountry}</span> : <span className="text-gray-400 text-[11px]">—</span>; })()}
                              </td>
                              {/* Training Venue */}
                              <td className="px-4 py-3 max-w-[180px]">
                                {(a.trainingVenue || a.venueName)
                                  ? <div className="truncate text-gray-700 text-[11px]" title={a.trainingVenue || a.venueName}>{a.trainingVenue || a.venueName}</div>
                                  : <span className="text-gray-400 text-[11px]">—</span>}
                              </td>
                              {/* Trainer */}
                              <td className="px-4 py-3 text-gray-700">
                                <div className="font-medium whitespace-nowrap">{a.trainerName || '—'}</div>
                                {a.trainerEmail && <div className="text-[10px] text-gray-400">{a.trainerEmail}</div>}
                              </td>
                              {/* SCID */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                {a.scid
                                  ? <span className="font-mono text-[11px] text-cyan-700 bg-cyan-50 border border-cyan-100 px-2 py-0.5 rounded">{a.scid}</span>
                                  : <span className="text-gray-400 text-[11px]">—</span>}
                              </td>
                              {/* No. of Participants */}
                              <td className="px-4 py-3 whitespace-nowrap text-center">
                                {a.noOfParticipants != null
                                  ? <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold text-[11px] border border-indigo-100 min-w-[32px]">{a.noOfParticipants}</span>
                                  : <span className="text-gray-400 text-[11px]">—</span>}
                              </td>
                              {/* Start Time */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                {a.startTime
                                  ? <span className="inline-flex items-center px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-700 font-semibold text-[11px]">{a.startTime}</span>
                                  : <span className="text-gray-400 text-[11px]">—</span>}
                              </td>
                              {/* End Time */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                {a.endTime
                                  ? <span className="inline-flex items-center px-2 py-0.5 rounded bg-orange-50 border border-orange-200 text-orange-700 font-semibold text-[11px]">{a.endTime}</span>
                                  : <span className="text-gray-400 text-[11px]">—</span>}
                              </td>
                              {/* Source badge */}
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${a.source === 'api' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {a.source === 'api' ? 'PMS' : 'Manual'}
                                </span>
                              </td>
                              {/* Actions */}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <button type="button" onClick={() => openEditModal(a)} className="text-blue-500 hover:text-blue-700">
                                    <Edit3 size={13} />
                                  </button>
                                  <button type="button" onClick={() => removeAssignment(a.id)} className="text-red-400 hover:text-red-600">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                </>
              )}
            </div>

            {/* ── Section 3: Leave Dates ─────────────────────────────────────── */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-orange-700 flex items-center gap-2">
                    <Calendar size={15} className="text-orange-500" />
                    Step 3 — Leave Dates
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Leave records from Koenig PMS for{' '}
                    <span className="font-semibold text-gray-600">{fromDate ? fmt(fromDate) : '—'} → {toDate ? fmt(toDate) : '—'}</span>
                    {currentUser?.trainerId && (
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-100 font-mono text-[10px]">
                        EMP: {(currentUser.trainerId ?? '').replace(/^EMP-/i, '')}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {leavesLoading && (
                    <div className="flex items-center gap-1.5 text-xs text-orange-600">
                      <Loader2 size={13} className="animate-spin" /> Fetching…
                    </div>
                  )}
                  {leaveDates.size > 0 && (
                    <>
                      <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold">
                        {leaveDates.size} leave day{leaveDates.size !== 1 ? 's' : ''} marked
                      </span>
                      <button type="button" onClick={() => setLeaveDates(new Set())}
                        className="text-xs text-gray-400 hover:text-red-500 underline transition-colors">
                        Clear all
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* API Error */}
              {leavesError && (
                <div className="flex items-start gap-2 mb-3 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  <span>{leavesError}</span>
                </div>
              )}

              {/* ── PMS Leave Records Table ── */}
              {!leavesLoading && pmsLeaves.length > 0 && (
                <>
                  {/* Summary mini-cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                    {[
                      { label: 'Total Leaves',    value: pmsLeaves.length,
                        color: 'bg-orange-50 text-orange-700 border border-orange-100' },
                      { label: 'Approved',         value: pmsLeaves.filter(r => isApprovedLeave(r.leave_status)).length,
                        color: 'bg-green-50 text-green-700 border border-green-100' },
                      { label: 'Pending',          value: pmsLeaves.filter(r => isPendingLeave(r.leave_status)).length,
                        color: 'bg-amber-50 text-amber-700 border border-amber-100' },
                      { label: 'Cancelled',        value: pmsLeaves.filter(r => isCancelledLeave(r.leave_status)).length,
                        color: 'bg-red-50 text-red-700 border border-red-100' },
                      { label: 'Days Auto-Marked', value: leaveDates.size,
                        color: 'bg-purple-50 text-purple-700 border border-purple-100' },
                    ].map(c => (
                      <div key={c.label} className={`rounded-xl px-4 py-3 ${c.color}`}>
                        <p className="text-xs font-medium opacity-70">{c.label}</p>
                        <p className="text-2xl font-bold mt-0.5">{c.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Leave records table */}
                  <div className="mb-4 rounded-xl border border-orange-200 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-orange-50 border-b border-orange-200">
                      <div className="flex items-center gap-2 text-orange-800 text-xs font-semibold">
                        <Calendar size={13} />
                        {pmsLeaves.length} leave record{pmsLeaves.length !== 1 ? 's' : ''} from Koenig PMS
                        <span className="ml-1 px-2 py-0.5 rounded-full bg-orange-200 text-orange-800 text-[10px]">
                          All leaves from PMS auto-marked on date grid
                        </span>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            {['Emp Code','Name','Leave Type','From Date','From Time','To Date','To Time','Days','Status','Approval Date'].map(h => (
                              <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold whitespace-nowrap text-[11px]">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {pmsLeaves.map((r, idx) => {
                            const approved   = isApprovedLeave(r.leave_status);
                            const pending    = isPendingLeave(r.leave_status);
                            const cancelled  = isCancelledLeave(r.leave_status);
                            const fd = parseLeaveDate(r.from_date);
                            const td = parseLeaveDate(r.to_date);
                            const days = r.no_of_days ?? (fd && td ? Math.max(1, Math.round((new Date(td + 'T00:00:00').getTime() - new Date(fd + 'T00:00:00').getTime()) / 86400000) + 1) : 1);
                            const halfDay = r.is_half_day || (r.half_day && r.half_day !== '0' && r.half_day !== 'false') || ((r.duration ?? '').toLowerCase().includes('half'));
                            return (
                              <tr key={idx} className={
                                cancelled  ? 'bg-red-50/30 opacity-70' :
                                approved   ? 'bg-orange-50/40' :
                                'bg-white hover:bg-gray-50'
                              }>
                                <td className={`px-3 py-2.5 text-gray-500 font-mono text-[11px] whitespace-nowrap ${cancelled ? 'line-through' : ''}`}>{r.emp_code ?? '—'}</td>
                                <td className={`px-3 py-2.5 font-medium text-gray-800 whitespace-nowrap ${cancelled ? 'line-through' : ''}`}>{r.emp_name ?? '—'}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  <div className="flex flex-col gap-0.5">
                                    {r.leave_type
                                      ? <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${cancelled ? 'bg-gray-100 text-gray-400 line-through' : 'bg-blue-100 text-blue-700'}`}>{r.leave_type}</span>
                                      : <span className="text-gray-400">—</span>}
                                    {halfDay && <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 text-[10px] font-medium">Half Day</span>}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  {fd ? <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${cancelled ? 'bg-gray-50 border border-gray-200 text-gray-400 line-through' : 'bg-orange-50 border border-orange-200 text-orange-800'}`}>{fmt(fd)}</span> : <span className="text-gray-400">—</span>}
                                </td>
                                <td className={`px-3 py-2.5 text-gray-500 whitespace-nowrap ${cancelled ? 'line-through' : ''}`}>{r.from_time ? String(r.from_time).slice(0,5) : '—'}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  {td ? <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${cancelled ? 'bg-gray-50 border border-gray-200 text-gray-400 line-through' : 'bg-red-50 border border-red-200 text-red-800'}`}>{fmt(td)}</span> : <span className="text-gray-400">—</span>}
                                </td>
                                <td className={`px-3 py-2.5 text-gray-500 whitespace-nowrap ${cancelled ? 'line-through' : ''}`}>{r.to_time ? String(r.to_time).slice(0,5) : '—'}</td>
                                <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded-full font-semibold text-[11px] ${cancelled ? 'bg-gray-100 text-gray-400 line-through' : 'bg-purple-100 text-purple-700'}`}>{days}d</span>
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold
                                    ${cancelled  ? 'bg-red-100 text-red-600' :
                                      approved   ? 'bg-green-100 text-green-700' :
                                      pending    ? 'bg-amber-100 text-amber-700' :
                                                   'bg-gray-100 text-gray-600'}`}>
                                    {r.leave_status ?? '—'}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                                  {r.leave_approval_date ? fmt(parseLeaveDate(r.leave_approval_date)) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* Empty state — no leaves in range */}
              {!leavesLoading && !leavesError && pmsLeaves.length === 0 && fetched && (
                <div className="mb-4 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <div className="flex items-start gap-2">
                    <Calendar size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-gray-600">No leave records found in Koenig PMS</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Queried emp_code:{' '}
                        <span className="font-mono px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">
                          {(currentUser?.trainerId ?? '').replace(/^EMP-/i, '') || '—'}
                        </span>
                        {' '}for range{' '}
                        <span className="font-semibold">{fmt(fromDate)} → {fmt(toDate)}</span>
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        If your leave data is maintained in PMS, contact HR to verify your emp_code mapping. You can mark leave days manually below.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Date grid (manual toggle) ── */}
              {assignmentDates.length > 0 ? (
                <>
                  <p className="text-xs font-semibold text-gray-500 mb-2">
                    {pmsLeaves.length > 0 ? 'Adjust leave days manually (click to toggle):' : 'Mark leave days manually (click to toggle):'}
                  </p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {assignmentDates.map(iso => {
                      const day = dayName(iso);
                      const isWeekend = day === 'Sun' || day === 'Sat';
                      // Find if this date has a PMS leave record
                      const pmsLeave = pmsLeaves.find(r => {
                        const fd = parseLeaveDate(r.from_date);
                        const td = parseLeaveDate(r.to_date) || fd;
                        return fd && iso >= fd && iso <= td;
                      });
                      const isCancelled = pmsLeave !== undefined && isCancelledLeave(pmsLeave.leave_status);
                      // Manual per-record exception (see LEAVE_RECORD_OVERRIDE_EXCLUDE) — must be
                      // respected here too, not just in the auto-mark Set, since this tile
                      // independently re-derives "is this a leave day" from the raw PMS record.
                      const isOverridden = LEAVE_RECORD_OVERRIDE_EXCLUDE.has(`${empCode}|${iso}`);
                      // Orange if manually toggled OR PMS leave is active (not cancelled, not overridden)
                      const isLeave = leaveDates.has(iso) || (pmsLeave !== undefined && !isCancelled && !isOverridden);
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => toggleLeaveDate(iso)}
                          title={
                            isCancelled
                              ? `Cancelled: ${pmsLeave!.leave_type ?? 'Leave'} — ${pmsLeave!.leave_status} (DA applicable)`
                              : pmsLeave
                                ? `${pmsLeave.leave_type ?? 'Leave'} — ${pmsLeave.leave_status}`
                                : isLeave ? 'Click to unmark' : 'Click to mark as leave'
                          }
                          className={`flex flex-col items-center px-3 py-2 rounded-xl border-2 text-xs font-semibold transition-all select-none min-w-[62px]
                            ${isCancelled
                              ? 'bg-gray-100 border-gray-300 text-gray-400 opacity-70'
                              : isLeave
                                ? 'bg-orange-500 border-orange-500 text-white shadow-md scale-105'
                                : isWeekend
                                  ? 'bg-gray-50 border-gray-200 text-gray-400 hover:border-orange-300 hover:bg-orange-50'
                                  : 'bg-green-50 border-green-200 text-green-700 hover:border-orange-300 hover:bg-orange-50'
                            }`}
                        >
                          <span className="text-[10px] font-medium opacity-80">{day}</span>
                          <span className={`text-sm font-bold leading-tight ${isCancelled ? 'line-through' : ''}`}>
                            {new Date(iso + 'T00:00:00').getDate()}
                          </span>
                          <span className="text-[10px] opacity-70">
                            {new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' })}
                          </span>
                          {isCancelled && (
                            <span className="mt-0.5 text-[9px] font-bold tracking-wide uppercase opacity-80 text-red-400">
                              Cncld
                            </span>
                          )}
                          {!isCancelled && isLeave && (
                            <span className="mt-0.5 text-[9px] font-bold tracking-wide uppercase opacity-90">
                              {pmsLeave ? (pmsLeave.leave_type ?? 'Leave').slice(0, 6) : 'Leave'}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-300 inline-block" />
                      <span className="text-gray-500">Working ({assignmentDates.length - leaveDates.size})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm bg-orange-500 inline-block" />
                      <span className="text-gray-500">Leave — no DA ({leaveDates.size})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-300 inline-block" />
                      <span className="text-gray-500">Cancelled leave — DA applies ({pmsLeaves.filter(r => isCancelledLeave(r.leave_status)).length})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-200 inline-block" />
                      <span className="text-gray-500">Weekend</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 py-6 justify-center border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-xs">
                  <Calendar size={18} className="opacity-40" />
                  Fetch data first to see leave dates
                </div>
              )}
            </div>

            {/* ── Section 4: DA Eligibility ──────────────────────────────────── */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 pt-4 pb-2">
                <SectionTitle>Step 4 — DA Eligibility &amp; Auto Calculation (As per Policy) <span style={{fontSize:'10px',background:'#dcfce7',color:'#166534',padding:'1px 6px',borderRadius:'4px',marginLeft:'6px'}}>v28Jul-F</span></SectionTitle>
                <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                  <Info size={11} />
                  DA rate is fetched per day from the assignment country set in Step 2. Set the correct country per assignment to get accurate rates.
                </p>
                {(() => {
                  const delhiNcrDates = lodgingEntries.length === 0
                    ? null
                    : lodgingEntries.filter(l => l.stayType === 'Apartment').length;
                  return (
                    <p className={`text-xs mt-1.5 flex items-center gap-1 ${lodgingEntries.length > 0 ? 'text-violet-600' : 'text-amber-600'}`}>
                      <Info size={11} />
                      {lodgingEntries.length === 0
                        ? 'Delhi-NCR dates: DA blocked until you add an Apartment stay in Step 6.'
                        : delhiNcrDates && delhiNcrDates > 0
                          ? `${delhiNcrDates} apartment stay(s) in Step 6 — Delhi-NCR DA unlocked for covered dates.`
                          : 'Lodging added in Step 6. Mark stay type as "Apartment" to unlock DA for Delhi-NCR dates.'}
                    </p>
                  );
                })()}
              </div>

              {/* Country DA Rate Summary — derived from Step 2 assignments */}
              {fetched && assignments.length > 0 && (() => {
                const uniqueCountries = Array.from(new Set(assignments.map(a => a.country).filter(Boolean)));
                return (
                  <div className="px-5 pb-3">
                    <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                      <Info size={11} className="text-blue-400" />
                      DA Rates for Countries in Your Assignments (Step 2)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {uniqueCountries.map(country => {
                        const info = getDaInfo(country);
                        return (
                          <div key={country}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${
                              info.allowed
                                ? 'bg-green-50 border-green-200 text-green-800'
                                : 'bg-red-50 border-red-200 text-red-700'
                            }`}>
                            <span className="font-semibold">{country}</span>
                            {info.allowed ? (
                              <span className="text-green-600">
                                {info.currency === 'INR' ? '₹' : info.currency} {info.rate}/day
                              </span>
                            ) : (
                              <span className="text-red-500">No DA policy</span>
                            )}
                          </div>
                        );
                      })}
                      {/* Countries from Koenig list with no DA policy warning */}
                      {koenigCountries.length > 0 && uniqueCountries.some(c => !getDaInfo(c).allowed) && (
                        <p className="w-full text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <Info size={11} />
                          Countries without DA policy — update assignments in Step 2 to set correct country, or contact HR to add the rate.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 border-y border-gray-200">
                    <tr>
                      {['Date', 'Day', 'Assignment ID', 'Country', 'DA Status', 'DA Rate', 'Amount', 'Remarks'].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            {(h === 'DA Status' || h === 'DA Rate') && <Info size={11} className="text-gray-400" />}
                            {h}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {daRows.filter(r => !r.status.includes('Online Batch')).map(r => (
                      <tr key={r.iso} className={r.amount === 0 ? 'opacity-60' : 'hover:bg-blue-50/30'}>
                        <td className="px-4 py-3 font-medium text-gray-700 whitespace-nowrap">{fmt(r.iso)}</td>
                        <td className="px-4 py-3 text-gray-600">{r.day}</td>
                        <td className="px-4 py-3 text-xs">
                          {r.assignmentId ? (
                            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono font-semibold">#{r.assignmentId}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.country}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${r.statusClass}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {r.amount > 0 ? formatDaCurrency(r.rate, r.currency) : '—'}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-800">
                          {r.amount > 0 ? formatDaCurrency(r.amount, r.currency) : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{r.remarks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-4 bg-green-50 border-t-2 border-green-200">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Per-currency amounts */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Auto DA Total:</span>
                    {autoDATotal > 0 && (
                      <span className="text-base font-bold text-green-700">{formatINR(autoDATotal)}</span>
                    )}
                    {Object.entries(foreignDAMap).map(([cur, amt]) => (
                      <span key={cur} className="text-base font-bold text-blue-700">{formatDaCurrency(amt, cur)}</span>
                    ))}
                    {autoDATotal === 0 && Object.keys(foreignDAMap).length === 0 && (
                      <span className="text-gray-400 text-sm">—</span>
                    )}
                  </div>
                  {/* Combined INR equivalent — always shown when foreign DA exists */}
                  {Object.keys(foreignDAMap).length > 0 && (
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-semibold text-green-600 uppercase tracking-wide">
                        Combined Total (INR equiv.)
                      </span>
                      <span className="text-xl font-extrabold text-green-800">
                        {formatINR(autoDATotal + foreignDATotalINR)}
                      </span>
                      <span className="text-[10px] text-gray-500 mt-0.5">
                        {Object.entries(foreignDAMap).map(([c, a]) =>
                          `${formatDaCurrency(a, c)} × ₹${FX_TO_INR[c] ?? '?'} = ${formatINR(a * (FX_TO_INR[c] ?? 0))}`
                        ).join('  +  ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Section 4: Flight & Travel Details ─────────────────────────── */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold text-blue-700 flex items-center gap-2">
                    <Plane size={15} className="text-blue-500" />
                    Step 5 — Flight &amp; Travel Details
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Travel booked in Koenig PMS for EMP-<span className="font-mono">{empCode}</span>
                    <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 font-mono text-[10px]">
                      {fmt(fromDate)} → {fmt(toDate)}
                    </span>
                  </p>
                </div>
                {flightsLoading && (
                  <div className="flex items-center gap-2 text-xs text-blue-600">
                    <Loader2 size={14} className="animate-spin" /> Fetching…
                  </div>
                )}
              </div>

              {/* ILO banner — flight not required when all assignments are online */}
              {(() => {
                const nonIlo = assignments.filter(a => a.batchType && a.batchType.toUpperCase() !== 'ILO');
                const iloOnly = assignments.length > 0 && nonIlo.length === 0;
                const hasIlo  = assignments.some(a => a.batchType?.toUpperCase() === 'ILO');
                if (iloOnly) return (
                  <div className="flex items-start gap-2 mb-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    <Info size={13} className="flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>No travel required</strong> — all assignments in Step 2 are <strong>ILO (Online)</strong>.
                      Flights are not applicable for online batches.
                    </span>
                  </div>
                );
                if (hasIlo && nonIlo.length > 0) return (
                  <div className="flex items-start gap-2 mb-3 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                    <Info size={13} className="flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Note:</strong> {assignments.filter(a => a.batchType?.toUpperCase() === 'ILO').length} ILO (online) assignment(s) do not require travel.
                      Flights below apply to offline/hybrid assignments only.
                    </span>
                  </div>
                );
                return null;
              })()}

              {/* Error */}
              {flightsError && (
                <div className="flex items-center gap-2 mb-3 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <AlertCircle size={13} className="flex-shrink-0" /> {flightsError}
                </div>
              )}

              {/* Summary mini-cards */}
              {!flightsLoading && pmsFlights.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'In Range',      value: pmsFlights.length,
                      sub: `${fmt(fromDate)} → ${fmt(toDate)}`,
                      color: 'bg-blue-50 text-blue-700 border border-blue-100' },
                    { label: 'Active',        value: pmsFlights.filter(f => f.Is_cancelled !== 'Yes').length,
                      sub: `${pmsFlights.filter(f => f.Is_cancelled === 'Yes').length} cancelled`,
                      color: 'bg-green-50 text-green-700 border border-green-100' },
                    { label: 'With Ticket',   value: pmsFlights.filter(f => !!f.ticket_path).length,
                      sub: 'documents available',
                      color: 'bg-teal-50 text-teal-700 border border-teal-100' },
                    { label: 'Transport Types', value: new Set(pmsFlights.map(f => f.transport_type).filter(Boolean)).size || new Set(pmsFlights.map(f => f.airlines_name).filter(Boolean)).size,
                      sub: Array.from(new Set(pmsFlights.map(f => f.transport_type).filter(Boolean))).join(', ') || 'airlines',
                      color: 'bg-purple-50 text-purple-700 border border-purple-100' },
                  ].map(c => (
                    <div key={c.label} className={`rounded-xl px-4 py-3 ${c.color}`}>
                      <p className="text-xs font-medium opacity-70">{c.label}</p>
                      <p className="text-2xl font-bold mt-0.5">{c.value}</p>
                      <p className="text-[10px] opacity-60 mt-0.5 truncate">{c.sub}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Flight / Travel table */}
              {!flightsLoading && !flightsError && pmsFlights.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border-b border-blue-100">
                    <span className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
                      <Plane size={12} />
                      {pmsFlights.filter(f => f.Is_cancelled !== 'Yes').length} active record(s) · sorted oldest → newest
                    </span>
                    <span className="text-[10px] text-blue-600">Departure date within {fmt(fromDate)} → {fmt(toDate)}</span>
                  </div>
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {[
                          'Trip ID', 'Type', 'Flight No.', 'Airline / Carrier',
                          'From', 'To',
                          'Departure', 'Dep. Time',
                          'Arrival', 'Arr. Time',
                          'Status', 'Ticket', 'Insurance', 'Action',
                        ].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold whitespace-nowrap text-[11px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {pmsFlights.map((f, idx) => {
                        const tripKey = String(f.trip_ID ?? `${f.flight_number}-${parseDT(f.departure_date)}`);
                        const alreadyImported = importedTripIds.has(tripKey);
                        const isCancelled = f.Is_cancelled === 'Yes';
                        const depDate = parseDT(f.departure_date);
                        const arrDate = parseDT(f.arrival_date);
                        const transportType = f.transport_type ? String(f.transport_type).trim() : null;
                        const isAir = !transportType || transportType.toLowerCase().includes('flight') || transportType.toLowerCase().includes('air');
                        const typeColor = isAir ? 'bg-blue-100 text-blue-700'
                          : transportType?.toLowerCase().includes('train') ? 'bg-green-100 text-green-700'
                          : 'bg-orange-100 text-orange-700';
                        const ticketUrl = f.ticket_path
                          ? (String(f.ticket_path).startsWith('http') ? f.ticket_path as string
                            : `https://api.koenig-solutions.com${String(f.ticket_path).startsWith('/') ? '' : '/'}${f.ticket_path}`)
                          : null;
                        const insuranceUrl = f.insurance_path
                          ? (String(f.insurance_path).startsWith('http') ? f.insurance_path as string
                            : `https://api.koenig-solutions.com${String(f.insurance_path).startsWith('/') ? '' : '/'}${f.insurance_path}`)
                          : null;
                        return (
                          <tr key={idx} className={
                            isCancelled ? 'bg-red-50/50 opacity-70'
                            : alreadyImported ? 'bg-green-50'
                            : idx % 2 === 0 ? 'bg-white hover:bg-blue-50/30'
                            : 'bg-gray-50/40 hover:bg-blue-50/30'
                          }>
                            {/* Trip ID */}
                            <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap font-mono text-[11px]">
                              {f.trip_ID ?? '—'}
                            </td>
                            {/* Transport Type */}
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {transportType
                                ? <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${typeColor}`}>{transportType}</span>
                                : <span className="px-2 py-0.5 rounded-full font-semibold text-[10px] bg-blue-100 text-blue-700">Flight</span>}
                            </td>
                            {/* Flight No */}
                            <td className={`px-3 py-2.5 font-semibold whitespace-nowrap ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                              {f.flight_number ?? '—'}
                            </td>
                            {/* Airline */}
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {f.airlines_name
                                ? <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400' : 'bg-blue-100 text-blue-700'}`}>{f.airlines_name}</span>
                                : <span className="text-gray-400">—</span>}
                            </td>
                            {/* From */}
                            <td className={`px-3 py-2.5 font-medium whitespace-nowrap ${isCancelled ? 'text-gray-400' : 'text-gray-800'}`}>
                              {f.from_city ?? '—'}
                            </td>
                            {/* To */}
                            <td className={`px-3 py-2.5 font-medium whitespace-nowrap ${isCancelled ? 'text-gray-400' : 'text-gray-800'}`}>
                              {f.to_city ?? '—'}
                            </td>
                            {/* Departure Date */}
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {depDate
                                ? <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400' : 'bg-teal-50 border border-teal-200 text-teal-800'}`}>{fmt(depDate)}</span>
                                : <span className="text-gray-400">—</span>}
                            </td>
                            {/* Dep Time */}
                            <td className={`px-3 py-2.5 whitespace-nowrap ${isCancelled ? 'text-gray-400' : 'text-gray-600'}`}>
                              {f.departure_time ? parseTM(f.departure_time) : '—'}
                            </td>
                            {/* Arrival Date */}
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {arrDate
                                ? <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400' : 'bg-orange-50 border border-orange-200 text-orange-800'}`}>{fmt(arrDate)}</span>
                                : <span className="text-gray-400">—</span>}
                            </td>
                            {/* Arr Time */}
                            <td className={`px-3 py-2.5 whitespace-nowrap ${isCancelled ? 'text-gray-400' : 'text-gray-600'}`}>
                              {f.arrival_time ? parseTM(f.arrival_time) : '—'}
                            </td>
                            {/* Status */}
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {isCancelled
                                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold text-[10px]"><X size={9} /> Cancelled</span>
                                : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold text-[10px]"><CheckCircle2 size={9} /> Active</span>}
                            </td>
                            {/* Ticket */}
                            <td className="px-3 py-2.5">
                              {ticketUrl
                                ? <a href={ticketUrl} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-600 text-[11px] font-medium transition-colors">
                                    <ExternalLink size={10} /> View
                                  </a>
                                : <span className="text-gray-300 text-[11px]">—</span>}
                            </td>
                            {/* Insurance */}
                            <td className="px-3 py-2.5">
                              {insuranceUrl
                                ? <a href={insuranceUrl} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-600 text-[11px] font-medium transition-colors">
                                    <ExternalLink size={10} /> View
                                  </a>
                                : <span className="text-gray-300 text-[11px]">—</span>}
                            </td>
                            {/* Action */}
                            <td className="px-3 py-2.5">
                              {isCancelled
                                ? <span className="text-red-400 text-[11px] font-medium">Cancelled</span>
                                : alreadyImported
                                  ? <span className="inline-flex items-center gap-1 text-green-600 text-[11px] font-medium whitespace-nowrap"><CheckCircle2 size={11} /> Added</span>
                                  : <button type="button" onClick={() => importFlightAsBill(f)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold transition-colors whitespace-nowrap">
                                      <Plus size={10} /> Add to Bill
                                    </button>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!flightsLoading && !flightsError && pmsFlights.length === 0 && fetched && (
                <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
                  <Plane size={32} className="mb-3 opacity-30" />
                  <p className="text-sm font-medium">No travel records found for this date range</p>
                  <p className="text-xs mt-1 opacity-60">EMP-<span className="font-mono">{empCode}</span> · {fmt(fromDate)} → {fmt(toDate)}</p>
                  <p className="text-xs mt-1 opacity-50">Travel booked in Koenig PMS will appear here automatically</p>
                </div>
              )}
            </div>

            {/* ── Section 5: Lodging / Hotel Stays ──────────────────────────── */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-blue-700 flex items-center gap-2">
                    <Hotel size={15} className="text-blue-500" />
                    Step 6 — Lodging / Hotel Stays
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Koenig PMS accommodation for{' '}
                    <span className="font-semibold text-gray-600">{fromDate ? fmt(fromDate) : '—'}</span>
                    {' '}→{' '}
                    <span className="font-semibold text-gray-600">{toDate ? fmt(toDate) : '—'}</span>
                    {currentUser?.email && (
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-teal-50 text-teal-600 border border-teal-100 font-mono text-[10px]">
                        {currentUser.email}
                      </span>
                    )}
                  </p>
                </div>
                {accomLoading && (
                  <div className="flex items-center gap-2 text-xs text-teal-600">
                    <Loader2 size={14} className="animate-spin" />
                    Fetching for {currentUser?.email ?? 'trainer'}…
                  </div>
                )}
              </div>

              {/* DA ↔ Lodging policy link */}
              <div className="mb-3 flex items-start gap-2 px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-lg text-xs text-violet-800">
                <Info size={13} className="flex-shrink-0 mt-0.5 text-violet-500" />
                <span>
                  <strong>Step 6 → Step 4 (DA):</strong> For <strong>Delhi-NCR</strong> assignments, DA is allowed <em>only</em> when you are staying in an <strong>Apartment</strong> overnight.
                  Import your PMS stay below and ensure the <strong>Stay Type</strong> is set to <strong>Apartment</strong> — Step 4 will automatically unlock DA for those dates.
                </span>
              </div>

              {/* API Error */}
              {accomError && (
                <div className="flex items-start gap-2 mb-3 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  <span>{accomError}</span>
                </div>
              )}

              {/* ── Summary mini-cards ── */}
              {!accomLoading && pmsAccom.length > 0 && (() => {
                const activeStays    = pmsAccom.filter(r => r.Is_caneclled !== '1' && r.Is_caneclled !== 1);
                const cancelledCount = pmsAccom.length - activeStays.length;
                const totalNights    = activeStays.reduce((s, r) => s + (r.Nights ?? 0), 0);
                const cities         = new Set(pmsAccom.map(r => r.CityName).filter(Boolean)).size;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {[
                      { label: 'Stays in Range',  value: pmsAccom.length,
                        sub: `${fmt(fromDate)} → ${fmt(toDate)}`,
                        color: 'bg-teal-50 text-teal-700 border border-teal-100' },
                      { label: 'Active Stays',    value: activeStays.length,
                        sub: `${cancelledCount} cancelled`,
                        color: 'bg-green-50 text-green-700 border border-green-100' },
                      { label: 'Total Nights',    value: totalNights,
                        sub: 'active stays only',
                        color: 'bg-blue-50 text-blue-700 border border-blue-100' },
                      { label: 'Cities',          value: cities,
                        sub: 'unique cities',
                        color: 'bg-purple-50 text-purple-700 border border-purple-100' },
                    ].map(c => (
                      <div key={c.label} className={`rounded-xl px-4 py-3 ${c.color}`}>
                        <p className="text-xs font-medium opacity-70">{c.label}</p>
                        <p className="text-2xl font-bold mt-0.5">{c.value}</p>
                        <p className="text-[10px] opacity-60 mt-0.5">{c.sub}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* ── Full PMS Accommodation Table (already date-range filtered at fetch time) ── */}
              {!accomLoading && pmsAccom.length > 0 && (() => {
                const rangeRows = pmsAccom; // already filtered and sorted at fetch time
                return (
                  <div className="mb-4 rounded-xl border border-teal-200 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-teal-50 border-b border-teal-200">
                      <div className="flex items-center gap-2 text-teal-800 text-xs font-semibold">
                        <Hotel size={13} />
                        {rangeRows.length} stay{rangeRows.length !== 1 ? 's' : ''} in range · <span className="font-mono font-normal">{fmt(fromDate)} → {fmt(toDate)}</span>
                      </div>
                      <span className="text-[10px] text-teal-600">Click &quot;+ Import&quot; to add to this bill</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            {['Emp ID','Trainer','Accommodation','City','Room No','Check-In','Check-Out','Nights','Stay Dates','Status','PDF','Action'].map(h => (
                              <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold whitespace-nowrap text-[11px]">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {rangeRows.map((r, idx) => {
                            const key = `${r.AccommodationName}-${accomDT(r.CheckInDate)}`;
                            const imported = importedAccom.has(key);
                            const ci = accomDT(r.CheckInDate);
                            const co = accomDT(r.CheckOutDate);
                            // Is_caneclled: "1" or 1 = cancelled; "0" or 0 or null = active
                            const isCancelled = r.Is_caneclled === '1' || r.Is_caneclled === 1;
                            const pdfUrl = r.AccommodationPDF
                              ? (String(r.AccommodationPDF).startsWith('http')
                                  ? r.AccommodationPDF as string
                                  : `https://api.koenig-solutions.com${String(r.AccommodationPDF).startsWith('/') ? '' : '/'}${r.AccommodationPDF}`)
                              : null;
                            return (
                              <tr key={idx} className={
                                isCancelled ? 'bg-red-50/60 opacity-70'
                                : imported ? 'bg-green-50'
                                : idx % 2 === 0 ? 'bg-white hover:bg-teal-50/30'
                                : 'bg-gray-50/40 hover:bg-teal-50/30'
                              }>
                                {/* Emp ID */}
                                <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap text-[11px] font-mono">{r.EmpId ?? '—'}</td>
                                {/* Trainer Name */}
                                <td className={`px-3 py-2.5 whitespace-nowrap font-medium ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                  {r.TrainerName ?? '—'}
                                </td>
                                {/* Accommodation Name */}
                                <td className="px-3 py-2.5 max-w-[200px]">
                                  <div className={`font-semibold truncate ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-800'}`} title={r.AccommodationName ?? ''}>
                                    {r.AccommodationName ?? '—'}
                                  </div>
                                </td>
                                {/* City */}
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  {r.CityName
                                    ? <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400' : 'bg-purple-100 text-purple-700'}`}>{r.CityName}</span>
                                    : '—'}
                                </td>
                                {/* Room No */}
                                <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                  {r.RoomNo ? <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-mono text-[11px]">{r.RoomNo}</span> : '—'}
                                </td>
                                {/* Check-In */}
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  {ci
                                    ? <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400' : 'bg-teal-50 border border-teal-200 text-teal-800'}`}>{fmt(ci)}</span>
                                    : <span className="text-red-400 font-medium">—</span>}
                                </td>
                                {/* Check-Out */}
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  {co
                                    ? <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400' : 'bg-orange-50 border border-orange-200 text-orange-800'}`}>{fmt(co)}</span>
                                    : <span className="text-red-400 font-medium">—</span>}
                                </td>
                                {/* Nights */}
                                <td className="px-3 py-2.5 text-center">
                                  {r.Nights != null
                                    ? <span className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400' : 'bg-teal-100 text-teal-700'}`}>{r.Nights}</span>
                                    : '—'}
                                </td>
                                {/* Stay Dates */}
                                <td className="px-3 py-2.5 text-gray-500 max-w-[150px]">
                                  <div className={`truncate text-[11px] ${isCancelled ? 'line-through text-gray-400' : ''}`} title={r.StayDates ?? ''}>
                                    {r.StayDates || (ci && co ? `${fmt(ci)} → ${fmt(co)}` : '—')}
                                  </div>
                                </td>
                                {/* Status (Is_caneclled) */}
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  {isCancelled
                                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold text-[10px]">
                                        <X size={9} /> Cancelled
                                      </span>
                                    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold text-[10px]">
                                        <CheckCircle2 size={9} /> Active
                                      </span>}
                                </td>
                                {/* PDF */}
                                <td className="px-3 py-2.5">
                                  {pdfUrl
                                    ? <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-semibold transition-colors">
                                        <ExternalLink size={10} /> PDF
                                      </a>
                                    : <span className="text-gray-300 text-[11px]">No PDF</span>}
                                </td>
                                {/* Action */}
                                <td className="px-3 py-2.5">
                                  {isCancelled
                                    ? <span className="text-red-400 text-[11px] font-medium whitespace-nowrap">Cancelled</span>
                                    : imported
                                      ? <span className="inline-flex items-center gap-1 text-green-600 text-[11px] font-medium whitespace-nowrap"><CheckCircle2 size={11} /> Imported</span>
                                      : <button type="button" onClick={() => importAccomAsLodging(r)}
                                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-semibold transition-colors whitespace-nowrap">
                                          <Plus size={10} /> Import
                                        </button>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* Empty state — no PMS data at all */}
              {!accomLoading && !accomError && pmsAccom.length === 0 && fetched && (
                <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 mb-4">
                  <Hotel size={32} className="mb-3 opacity-30" />
                  <p className="text-sm font-medium">No accommodation records found in PMS</p>
                  <p className="text-xs mt-1 opacity-60">Searched with EMP-<span className="font-mono">{empCode}</span></p>
                  <p className="text-xs mt-2 opacity-50">Add stays manually using the form below</p>
                </div>
              )}

              {/* Manual Entry Form — hidden per product decision */}
              {false && <div className="pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2">Add Hotel Stay Manually</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Hotel / Accommodation Name *</label>
                    <input className={inputCls} placeholder="e.g. Hotel Lemon Tree" value={lodgingDraft.hotelName || ''}
                      onChange={e => setLodgingDraft(p => ({ ...p, hotelName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">City</label>
                    <input className={inputCls} placeholder="e.g. Bangalore" value={lodgingDraft.city || ''}
                      onChange={e => setLodgingDraft(p => ({ ...p, city: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Room No.</label>
                    <input className={inputCls} placeholder="e.g. 204" value={lodgingDraft.roomNo || ''}
                      onChange={e => setLodgingDraft(p => ({ ...p, roomNo: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Check-In Date</label>
                    <input type="date" className={inputCls} value={lodgingDraft.checkIn || ''}
                      min={fromDate} max={toDate}
                      onChange={e => setLodgingDraft(p => ({ ...p, checkIn: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Check-Out Date</label>
                    <input type="date" className={inputCls} value={lodgingDraft.checkOut || ''}
                      min={lodgingDraft.checkIn || fromDate} max={toDate}
                      onChange={e => setLodgingDraft(p => ({ ...p, checkOut: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Rate / Night (INR)</label>
                    <input type="number" className={inputCls} placeholder="₹ 2500" value={lodgingDraft.ratePerNight || ''}
                      onChange={e => setLodgingDraft(p => ({ ...p, ratePerNight: Number(e.target.value) }))} />
                  </div>
                  <div className="flex items-end">
                    <div className="w-full px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-semibold">
                      {calcNights(lodgingDraft.checkIn ?? '', lodgingDraft.checkOut ?? '')} nights
                      {lodgingDraft.ratePerNight ? ` · ₹ ${(calcNights(lodgingDraft.checkIn ?? '', lodgingDraft.checkOut ?? '') * (lodgingDraft.ratePerNight ?? 0)).toLocaleString('en-IN')}` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Upload Invoice</label>
                    <label className="flex items-center gap-2 px-3 py-2 text-xs border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                      <Upload size={12} className="text-gray-400" />
                      <span className="text-gray-500 truncate max-w-[140px]">{lodgingDraft.receipt || 'Choose File'}</span>
                      <input type="file" className="hidden" onChange={e => setLodgingDraft(p => ({ ...p, receipt: e.target.files?.[0]?.name || '' }))} />
                    </label>
                  </div>
                  <button type="button" onClick={addLodgingEntry}
                    disabled={!lodgingDraft.hotelName || !lodgingDraft.checkIn || !lodgingDraft.checkOut}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold mt-4 self-end">
                    <Plus size={13} /> Add Stay
                  </button>
                </div>
              </div>}

              {/* Lodging Entries List */}
              {lodgingEntries.length > 0 && (
                <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full text-xs divide-y divide-gray-100">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Hotel / Accommodation', 'Stay Type', 'City', 'Check-In', 'Check-Out', 'Nights', 'Rate/Night', 'Total', 'Source', 'Invoice', ''].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {lodgingEntries.slice().sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || '')).map(l => (
                        <tr key={l.id}>
                          <td className="px-3 py-2.5 font-medium text-gray-800 max-w-[160px]">
                            <div className="truncate">{l.hotelName || '—'}</div>
                            {l.roomNo && <div className="text-[10px] text-gray-400">Room {l.roomNo}</div>}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {(() => {
                              const isApt = isApartmentName(l.hotelName);
                              const t = isApt ? 'Apartment' : l.stayType ?? inferStayType(l.hotelName);
                              const cls = isApt ? 'bg-violet-100 text-violet-700 border-violet-200'
                                : t === 'Hotel'       ? 'bg-blue-100 text-blue-700 border-blue-200'
                                : t === 'Guest House' ? 'bg-teal-100 text-teal-700 border-teal-200'
                                : t === 'PG'          ? 'bg-orange-100 text-orange-700 border-orange-200'
                                : 'bg-gray-100 text-gray-600 border-gray-200';
                              return (
                                <>
                                  <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border ${cls}`}>{t}</span>
                                  {isApt && <div className="text-[9px] text-violet-500 mt-0.5">✓ DA eligible (Delhi-NCR)</div>}
                                </>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{l.city || '—'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {l.checkIn
                              ? <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-800 font-semibold text-[11px]">{fmt(l.checkIn)}</span>
                              : <span className="text-red-400 font-medium">—</span>}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {l.checkOut
                              ? <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-orange-50 border border-orange-200 text-orange-800 font-semibold text-[11px]">{fmt(l.checkOut)}</span>
                              : <span className="text-red-400 font-medium">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">{l.nights}</span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                            {l.ratePerNight > 0 ? formatINR(l.ratePerNight) : <span className="text-amber-500 text-[11px]">Enter rate</span>}
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-green-700 whitespace-nowrap">
                            {l.ratePerNight > 0 ? formatINR(l.nights * l.ratePerNight) : '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${l.source === 'pms' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                              {l.source === 'pms' ? 'PMS' : 'Manual'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            {l.receipt
                              ? (l.receipt.startsWith('http')
                                  ? <a href={l.receipt} target="_blank" rel="noopener noreferrer"
                                      className="flex items-center gap-1 text-blue-600 hover:underline">
                                      <ExternalLink size={11} /> View
                                    </a>
                                  : <span className="flex items-center gap-1 text-blue-600"><Download size={11} />{l.receipt}</span>)
                              : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <button type="button" onClick={() => removeLodgingEntry(l.id)} className="text-red-500 hover:text-red-700">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-3 flex justify-between items-center pt-2 border-t border-gray-100">
                <span className="text-xs font-semibold text-gray-700">Total Lodging</span>
                <span className="text-sm font-bold text-green-700">{formatINR(lodgingTotal)}</span>
              </div>
            </div>

            {/* ── Section 4 & 6: Travel Bills + Misc Expenses ───────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* Travel Bills */}
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <h3 className="text-sm font-bold text-blue-700">Step 7 — Travel Bills</h3>
                    <p className="text-xs text-gray-400">Booked flights auto-fetched from PMS · add other expenses manually</p>
                  </div>
                  {flightsLoading && <Loader2 size={15} className="animate-spin text-blue-500 flex-shrink-0" />}
                </div>

                {/* ── PMS Flights Panel ─────────────────────────────────────── */}
                {flightsError && (
                  <div className="flex items-center gap-2 mt-2 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    <AlertCircle size={13} className="flex-shrink-0" />
                    <span>{flightsError}</span>
                  </div>
                )}

                {!flightsLoading && !flightsError && pmsFlights.length > 0 && (
                  <div className="mt-3 mb-4 rounded-xl border border-blue-200 bg-blue-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-blue-100 border-b border-blue-200">
                      <div className="flex items-center gap-2 text-blue-800 text-xs font-semibold">
                        <Plane size={13} />
                        Booked Flights from PMS ({pmsFlights.length} flight{pmsFlights.length !== 1 ? 's' : ''} in this date range)
                      </div>
                      <span className="text-[10px] text-blue-600">Click &quot;+ Import&quot; to add a flight as a travel bill</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b border-blue-200">
                            {['Flight', 'Airline', 'From → To', 'Departure', 'Arrival', 'Ticket', 'Action'].map(h => (
                              <th key={h} className="px-3 py-2 text-left text-blue-700 font-semibold whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-100">
                          {pmsFlights.map((f, idx) => {
                            const tripKey = String(f.trip_ID ?? `${f.flight_number}-${parseDT(f.departure_date)}`);
                            const alreadyImported = importedTripIds.has(tripKey);
                            return (
                              <tr key={idx} className={alreadyImported ? 'opacity-50 bg-blue-50' : 'hover:bg-white'}>
                                <td className="px-3 py-2.5 font-medium text-gray-700 whitespace-nowrap">
                                  {f.flight_number ?? '—'}
                                </td>
                                <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                                  {f.airlines_name ?? '—'}
                                </td>
                                <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                                  <span className="font-medium">{f.from_city ?? '—'}</span>
                                  <span className="text-gray-400 mx-1">→</span>
                                  <span className="font-medium">{f.to_city ?? '—'}</span>
                                </td>
                                <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                                  {parseDT(f.departure_date) ? fmt(parseDT(f.departure_date)) : '—'}
                                  {f.departure_time && <span className="text-gray-400 ml-1">· {parseTM(f.departure_time)}</span>}
                                </td>
                                <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                                  {parseDT(f.arrival_date) ? fmt(parseDT(f.arrival_date)) : '—'}
                                  {f.arrival_time && <span className="text-gray-400 ml-1">· {parseTM(f.arrival_time)}</span>}
                                </td>
                                <td className="px-3 py-2.5">
                                  {f.ticket_path
                                    ? <a href={f.ticket_path} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-blue-600 hover:underline text-[11px]">
                                        <ExternalLink size={10} /> View
                                      </a>
                                    : <span className="text-gray-400">—</span>}
                                </td>
                                <td className="px-3 py-2.5">
                                  {alreadyImported
                                    ? <span className="flex items-center gap-1 text-green-600 text-[11px] font-medium">
                                        <CheckCircle2 size={11} /> Imported
                                      </span>
                                    : <button
                                        type="button"
                                        onClick={() => importFlightAsBill(f)}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold transition-colors"
                                      >
                                        <Plus size={10} /> Import
                                      </button>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {!flightsLoading && !flightsError && pmsFlights.length === 0 && fetched && (
                  <div className="mt-3 mb-4 flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500">
                    <Plane size={13} className="text-gray-400 flex-shrink-0" />
                    No booked flights found in PMS for this date range. Add travel expenses manually below.
                  </div>
                )}

                {/* ── Manual Entry Form ─────────────────────────────────────── */}
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Add Travel Expense Manually</p>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Date</label>
                        <input type="date" className={inputCls} value={travelDraft.date || ''}
                          min={fromDate} max={toDate}
                          onChange={e => {
                            const newDate = e.target.value;
                            setTravelDraft(p => {
                              if (p.journeyType) {
                                const locs = deriveJourneyLocations(p.journeyType, newDate, assignments, lodgingEntries, pmsFlights, currentUser?.pmsDetails);
                                return { ...p, date: newDate, from: locs.from || p.from, to: locs.to || p.to, fromLat: undefined, fromLon: undefined, toLat: undefined, toLon: undefined, distance: '' };
                              }
                              return { ...p, date: newDate };
                            });
                          }} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Travel Type</label>
                        <select className={selectCls} value={travelDraft.travelType}
                          onChange={e => setTravelDraft(p => ({ ...p, travelType: e.target.value }))}>
                          {['Cab', 'Flight', 'Train', 'Bus', 'Own Vehicle', 'Metro', 'Other'].map(t => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </div>

                      {/* Journey Type */}
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-1 font-semibold">Journey Type</label>
                        <select
                          className={`${selectCls} ${
                            travelDraft.journeyType && travelDraft.date
                              ? validateJourneyType(travelDraft.journeyType, travelDraft.date, assignments, empCode).blocked
                                ? 'border-red-400 bg-red-50 focus:ring-red-300'
                                : 'border-green-400 bg-green-50 focus:ring-green-300'
                              : ''
                          }`}
                          value={travelDraft.journeyType || ''}
                          onChange={e => {
                            const jt = e.target.value;
                            const locs = jt
                              ? deriveJourneyLocations(jt, travelDraft.date || '', assignments, lodgingEntries, pmsFlights, currentUser?.pmsDetails)
                              : { from: '', to: '', fromSource: '', toSource: '' };
                            setTravelDraft(p => ({ ...p, journeyType: jt, from: locs.from, to: locs.to, fromLat: undefined, fromLon: undefined, toLat: undefined, toLon: undefined, distance: '' }));
                          }}
                        >
                          {JOURNEY_TYPES.map(jt => (
                            <option key={jt.value} value={jt.value}>{jt.label}</option>
                          ))}
                        </select>

                        {/* Validation feedback */}
                        {travelDraft.journeyType && travelDraft.date && (() => {
                          const v = validateJourneyType(travelDraft.journeyType, travelDraft.date, assignments, empCode);
                          return v.blocked ? (
                            <div className="mt-1.5 flex items-start gap-1.5 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                              <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                              <span>{v.message}</span>
                            </div>
                          ) : (
                            <div className="mt-1.5 flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                              <CheckCircle2 size={12} className="flex-shrink-0" />
                              <span>{v.message}</span>
                            </div>
                          );
                        })()}
                      </div>

                      {/* From — auto-filled + Google Maps style autocomplete */}
                      <div className={`col-span-2 ${(!travelDraft.journeyType || (travelDraft.date && validateJourneyType(travelDraft.journeyType, travelDraft.date, assignments, empCode).blocked)) ? 'opacity-40 pointer-events-none' : ''}`}>
                        <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1">
                          <MapPin size={11} className="text-blue-500" /> From Location
                        </label>
                        <LocationAutocomplete
                          value={travelDraft.from || ''}
                          onChange={v => setTravelDraft(p => ({ ...p, from: v, fromLat: undefined, fromLon: undefined, distance: '' }))}
                          onSelect={(name, lat, lon) => {
                            setTravelDraft(p => ({ ...p, from: name, fromLat: lat, fromLon: lon, distance: '' }));
                          }}
                          placeholder="Search pickup location…"
                        />
                        {aiExtracting && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] text-purple-600 font-medium animate-pulse">
                            <Loader2 size={10} className="animate-spin" /> AI reading receipt…
                          </p>
                        )}
                        {!aiExtracting && aiExtracted.from && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] text-purple-600 font-medium">
                            <Info size={10} /> 🤖 Auto-filled from receipt
                          </p>
                        )}
                        {!aiExtracting && !aiExtracted.from && travelDraft.journeyType && travelDraft.from && (() => {
                          const locs = deriveJourneyLocations(travelDraft.journeyType, travelDraft.date || '', assignments, lodgingEntries, pmsFlights, currentUser?.pmsDetails);
                          return locs.fromSource ? (
                            <p className="mt-1 flex items-center gap-1 text-[10px] text-blue-600 font-medium">
                              <Info size={10} /> Auto-filled from: {locs.fromSource}
                            </p>
                          ) : null;
                        })()}
                      </div>

                      {/* To — auto-filled + Google Maps style autocomplete */}
                      <div className={`col-span-2 ${(!travelDraft.journeyType || (travelDraft.date && validateJourneyType(travelDraft.journeyType, travelDraft.date, assignments, empCode).blocked)) ? 'opacity-40 pointer-events-none' : ''}`}>
                        <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1">
                          <MapPin size={11} className="text-red-500" /> To Location
                        </label>
                        <LocationAutocomplete
                          value={travelDraft.to || ''}
                          onChange={v => setTravelDraft(p => ({ ...p, to: v, toLat: undefined, toLon: undefined, distance: '' }))}
                          onSelect={(name, lat, lon) => {
                            setTravelDraft(p => ({ ...p, to: name, toLat: lat, toLon: lon, distance: '' }));
                          }}
                          placeholder="Search destination…"
                        />
                        {aiExtracting && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] text-purple-600 font-medium animate-pulse">
                            <Loader2 size={10} className="animate-spin" /> AI reading receipt…
                          </p>
                        )}
                        {!aiExtracting && aiExtracted.to && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] text-purple-600 font-medium">
                            <Info size={10} /> 🤖 Auto-filled from receipt
                          </p>
                        )}
                        {!aiExtracting && !aiExtracted.to && travelDraft.journeyType && travelDraft.to && (() => {
                          const locs = deriveJourneyLocations(travelDraft.journeyType, travelDraft.date || '', assignments, lodgingEntries, pmsFlights, currentUser?.pmsDetails);
                          return locs.toSource ? (
                            <p className="mt-1 flex items-center gap-1 text-[10px] text-red-600 font-medium">
                              <Info size={10} /> Auto-filled from: {locs.toSource}
                            </p>
                          ) : null;
                        })()}
                      </div>

                      {/* Distance — auto-calculated from From/To */}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1">
                          <Ruler size={11} className="text-gray-400" /> Distance
                          {distanceCalculating && (
                            <span className="ml-1 flex items-center gap-1 text-blue-500">
                              <Loader2 size={10} className="animate-spin" /> Calculating…
                            </span>
                          )}
                        </label>
                        <div className="relative">
                          <input
                            className={`${inputCls} ${travelDraft.distance ? 'bg-green-50 border-green-300 font-semibold text-green-800' : ''}`}
                            placeholder={distanceCalculating ? 'Calculating…' : 'Auto-calculated from locations above'}
                            readOnly={distanceCalculating}
                            value={travelDraft.distance || ''}
                            onChange={e => setTravelDraft(p => ({ ...p, distance: e.target.value }))}
                          />
                          {distanceCalculating && (
                            <Loader2 size={13} className="absolute right-2.5 top-2.5 animate-spin text-blue-400 pointer-events-none" />
                          )}
                        </div>
                        {travelDraft.distance && !distanceCalculating && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] text-green-600 font-medium">
                            <CheckCircle2 size={10} /> Auto-calculated · edit manually if needed
                          </p>
                        )}
                      </div>

                      {/* Amount + Currency */}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1">
                          <DollarSign size={11} className="text-green-500" /> Amount
                        </label>
                        <div className="flex gap-1.5">
                          <select
                            className="px-2 py-2 text-xs border border-gray-300 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[72px]"
                            value={travelDraft.currency || 'INR'}
                            onChange={e => setTravelDraft(p => ({ ...p, currency: e.target.value }))}>
                            {CURRENCIES.map(c => (
                              <option key={c.code} value={c.code}>{c.code} {c.symbol}</option>
                            ))}
                          </select>
                          <input type="number" className={inputCls} placeholder="0.00"
                            value={travelDraft.amount || ''}
                            onChange={e => setTravelDraft(p => ({ ...p, amount: Number(e.target.value) }))} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-red-600 mb-1">Upload Receipt <span className="text-red-500">*</span> <span className="font-normal text-gray-400">(required to add bill)</span></label>
                        <label className="flex items-center gap-2 px-3 py-2 text-xs border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                          <Upload size={12} className="text-gray-400" />
                          <span className="text-gray-500 truncate max-w-[150px]">{travelDraft.receiptData === '…uploading' ? '⏳ Uploading…' : travelDraft.receipt || 'Choose File'}</span>
                          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setAiExtracted({});
                            setTravelDraft(p => ({ ...p, receipt: file.name, receiptData: '…uploading' }));
                            const data = await compressAndEncode(file);
                            setTravelDraft(p => ({ ...p, receiptData: data }));
                            // AI extraction — read receipt and auto-fill From/To/Amount
                            setAiExtracting(true);
                            try {
                              const r = await fetch('/api/turso?type=extract', {
                                method: 'POST',
                                headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({ imageData: data, mediaType: file.type }),
                                signal: AbortSignal.timeout(20000),
                              });
                              if (r.ok) {
                                const ex = await r.json();
                                const filled: { from?: boolean; to?: boolean; amount?: boolean } = {};
                                setTravelDraft(p => {
                                  const next = { ...p };
                                  if (ex.from)   { next.from   = ex.from;   filled.from   = true; }
                                  if (ex.to)     { next.to     = ex.to;     filled.to     = true; }
                                  if (ex.amount && parseFloat(ex.amount) > 0) {
                                    next.amount   = parseFloat(ex.amount);  filled.amount = true;
                                  }
                                  if (ex.currency) next.currency = ex.currency;
                                  return next;
                                });
                                setAiExtracted(filled);
                              }
                            } catch { /* silent fail — trainer fills manually */ }
                            finally { setAiExtracting(false); }
                          }} />
                        </label>
                      </div>
                      <button type="button" onClick={addTravelBill}
                        disabled={
                          !travelDraft.from || !travelDraft.to || !travelDraft.amount ||
                          !travelDraft.journeyType ||
                          !travelDraft.receiptData || travelDraft.receiptData === '…uploading' ||
                          (!!travelDraft.journeyType && !!travelDraft.date && validateJourneyType(travelDraft.journeyType, travelDraft.date, assignments, empCode).blocked)
                        }
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold mt-4 self-end">
                        <Plus size={13} /> {travelDraft.receiptData === '…uploading' ? '⏳ Uploading…' : 'Add Bill'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Travel Bills List ─────────────────────────────────────── */}
                {travelBills.length > 0 && (
                  <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full text-xs divide-y divide-gray-100">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Date', 'Journey', 'Type', 'From → To', 'Amount', 'Receipt', ''].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {travelBills.map(b => (
                          <tr key={b.id}>
                            <td className="px-3 py-2 whitespace-nowrap">{fmt(b.date)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {b.journeyType
                                ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">{b.journeyType}</span>
                                : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-3 py-2">
                              <span className="flex items-center gap-1">
                                {b.travelType === 'Flight' && <Plane size={11} className="text-blue-500" />}
                                {b.travelType}
                              </span>
                            </td>
                            <td className="px-3 py-2 max-w-[120px]">
                              <div className="truncate">{b.from} → {b.to}</div>
                              {b.distance && <div className="text-gray-400">{b.distance}</div>}
                            </td>
                            <td className="px-3 py-2 font-semibold text-green-700 whitespace-nowrap">
                              {b.amount > 0 ? (
                                <span>
                                  {CURRENCIES.find(c => c.code === (b.currency || 'INR'))?.symbol ?? '₹'}{' '}
                                  {b.amount.toLocaleString('en-IN')}{b.currency && b.currency !== 'INR' ? ` ${b.currency}` : ''}
                                  {b.currency && b.currency !== 'INR' && FX_TO_INR[b.currency] && (
                                    <span className="block text-[10px] text-gray-400 font-normal">
                                      ≈ {formatINR(b.amount * FX_TO_INR[b.currency])}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-amber-500 font-medium text-[11px]">Enter amount</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {b.receipt
                                ? (b.receipt.startsWith('http')
                                    ? <a href={b.receipt} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-blue-600 hover:underline">
                                        <ExternalLink size={11} /> View
                                      </a>
                                    : <button type="button" className="flex items-center gap-1 text-blue-600 hover:underline">
                                        <Download size={11} />{b.receipt}
                                      </button>)
                                : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => removeTravelBill(b.id)} className="text-red-500 hover:text-red-700">
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-3 flex justify-between items-center pt-2 border-t border-gray-100">
                  <span className="text-xs font-semibold text-gray-700">Total Travel Bills</span>
                  <span className="text-sm font-bold text-green-700">{formatINR(travelTotal)}</span>
                </div>
              </div>

              {/* Miscellaneous Expenses */}
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
                <div className="mb-1">
                  <h3 className="text-sm font-bold text-blue-700">Step 8 — Miscellaneous Expenses</h3>
                  <p className="text-xs text-gray-400">Add any other eligible expenses</p>
                </div>

                <div className="space-y-3 mt-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Expense Type</label>
                      <select className={selectCls} value={miscDraft.expenseType}
                        onChange={e => setMiscDraft(p => ({ ...p, expenseType: e.target.value }))}>
                        <option>Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Date</label>
                      <input type="date" className={inputCls} value={miscDraft.date || ''}
                        min={fromDate} max={toDate}
                        onChange={e => setMiscDraft(p => ({ ...p, date: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Currency</label>
                      <select className={selectCls} value={miscDraft.currency || 'INR'}
                        onChange={e => setMiscDraft(p => ({ ...p, currency: e.target.value }))}>
                        {CURRENCIES.map(c => (
                          <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Amount</label>
                      <input type="number" className={inputCls} placeholder="150" value={miscDraft.amount || ''}
                        onChange={e => setMiscDraft(p => ({ ...p, amount: Number(e.target.value) }))} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Remarks</label>
                      <input className={inputCls} placeholder="Internet for training material" value={miscDraft.remarks || ''}
                        onChange={e => setMiscDraft(p => ({ ...p, remarks: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-red-600 mb-1">Upload Receipt <span className="text-red-500">*</span> <span className="font-normal text-gray-400">(required to add expense)</span></label>
                      <label className="flex items-center gap-2 px-3 py-2 text-xs border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                        <Upload size={12} className="text-gray-400" />
                        <span className="text-gray-500 truncate max-w-[150px]">{miscDraft.receiptData === '…uploading' ? '⏳ Uploading…' : miscDraft.receipt || 'Choose File'}</span>
                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setMiscDraft(p => ({ ...p, receipt: file.name, receiptData: '…uploading' }));
                            const data = await compressAndEncode(file);
                            setMiscDraft(p => ({ ...p, receiptData: data }));
                          }} />
                      </label>
                    </div>
                    <button type="button" onClick={addMiscExpense}
                      disabled={!miscDraft.amount || !miscDraft.receiptData || miscDraft.receiptData === '…uploading'}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold mt-4 self-end">
                      <Plus size={13} /> Add Expense
                    </button>
                  </div>
                </div>

                {miscExpenses.length > 0 && (
                  <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full text-xs divide-y divide-gray-100">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Date', 'Type', 'Currency', 'Amount', 'Remarks', 'Receipt', ''].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {miscExpenses.map(e => (
                          <tr key={e.id}>
                            <td className="px-3 py-2 whitespace-nowrap">{fmt(e.date)}</td>
                            <td className="px-3 py-2">{e.expenseType}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">{e.currency || 'INR'}</span>
                            </td>
                            <td className="px-3 py-2 font-semibold text-green-700 whitespace-nowrap">{e.amount.toLocaleString()}</td>
                            <td className="px-3 py-2 max-w-[120px] truncate">{e.remarks || '—'}</td>
                            <td className="px-3 py-2">
                              {e.receipt
                                ? <button type="button" className="flex items-center gap-1 text-blue-600 hover:underline"><Download size={11} />{e.receipt}</button>
                                : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => removeMiscExpense(e.id)} className="text-red-500 hover:text-red-700">
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-3 flex justify-between items-center pt-2 border-t border-gray-100">
                  <span className="text-xs font-semibold text-gray-700">Total Misc Expenses</span>
                  <span className="flex items-center gap-2 flex-wrap justify-end">
                    {Object.entries(miscTotalsByCurrency).map(([cur, amt]) => (
                      <span key={cur} className="text-sm font-bold text-green-700">
                        {cur === 'INR' ? formatINR(amt) : `${cur} ${amt.toLocaleString('en-IN')}`}
                      </span>
                    ))}
                  </span>
                </div>
              </div>

              {/* ── Step 9: Advance Taken ──────────────────────────────────── */}
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="text-sm font-bold text-violet-700 flex items-center gap-2">
                      <DollarSign size={15} className="text-violet-500" />
                      Step 9 — Advance Taken
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Advances for EMP-<span className="font-mono">{empCode}</span> within{' '}
                      <span className="font-semibold text-gray-600">{fromDate ? fmt(fromDate) : '—'} → {toDate ? fmt(toDate) : '—'}</span>
                      {' '}+ 90 days prior — auto-fetched from PMS &amp; deducted from net payable
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {advancesLoading && (
                      <span className="flex items-center gap-1.5 text-xs text-violet-500">
                        <Loader2 size={13} className="animate-spin" /> Fetching from PMS…
                      </span>
                    )}
                    {advancesInRange.length > 0 && (
                      <div className="text-right">
                        <p className="text-[10px] text-gray-400 uppercase">Total Advance</p>
                        <p className="text-lg font-extrabold text-violet-700">{formatINR(advanceTotal)}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Error banner */}
                {advancesError && (
                  <div className="mx-5 mb-3 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                    <Info size={13} className="flex-shrink-0 mt-0.5" />
                    <span>{advancesError}</span>
                  </div>
                )}

                {/* PMS Advance Records from apikey=259 — filtered to selected date range */}
                {pmsAdvancesInRange.length > 0 && (
                  <div className="px-5 mb-4">
                    <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
                      <Info size={11} className="text-violet-400" />
                      {pmsAdvancesInRange.length} Advance{pmsAdvancesInRange.length !== 1 ? 's' : ''} Found in PMS for {fmt(fromDate)} → {fmt(toDate)} — Import to adjust before submitting
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-violet-100">
                      <table className="min-w-full text-xs divide-y divide-gray-100">
                        <thead className="bg-violet-50">
                          <tr>
                            {['Advance ID', 'Emp Name', 'Date', 'Amount', 'Currency', 'Purpose', 'TA Bill No.', 'Narration', 'Status', ''].map(h => (
                              <th key={h} className="px-3 py-2.5 text-left text-violet-700 font-semibold whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {pmsAdvancesInRange.map((r, idx) => {
                            const key = String(r.TABillID ?? `${r.Date}-${r.Amount}`);
                            const alreadyImported = importedAdvanceIds.has(key);
                            const isCancelled = String(r.Status ?? '').toLowerCase().includes('cancel');
                            return (
                              <tr key={idx} className={isCancelled ? 'opacity-50' : 'hover:bg-violet-50/40'}>
                                <td className="px-3 py-2.5 font-mono text-violet-700 font-semibold">
                                  {r.TABillID && r.TABillID !== '0' ? `#${r.TABillID}` : '—'}
                                </td>
                                <td className="px-3 py-2.5 font-medium text-gray-800 whitespace-nowrap">
                                  {String(r.Type || '—')}
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">
                                  {parseDT(r.Date) ? fmt(parseDT(r.Date)) : (r.Date || '—')}
                                </td>
                                <td className="px-3 py-2.5 font-bold text-gray-800 whitespace-nowrap">
                                  {r.Amount != null ? Number(r.Amount).toLocaleString('en-IN') : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-gray-600">{r.Currency || 'INR'}</td>
                                <td className="px-3 py-2.5 text-gray-600 max-w-[180px] truncate">{r.Type || '—'}</td>
                                <td className="px-3 py-2.5 font-mono text-gray-400 text-[11px]">{r.TABillID && r.TABillID !== '0' ? `BILL-${r.TABillID}` : '—'}</td>
                                <td className="px-3 py-2.5 text-gray-600 text-[11px] max-w-[180px] truncate" title={r.Narration || ''}>{r.Narration || '—'}</td>
                                <td className="px-3 py-2.5">
                                  {r.Status ? (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                      isCancelled
                                        ? 'bg-red-100 text-red-600'
                                        : 'bg-green-100 text-green-700'
                                    }`}>{r.Status}</span>
                                  ) : '—'}
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  {isCancelled ? (
                                    <span className="text-[10px] text-red-400 font-medium">Cancelled</span>
                                  ) : alreadyImported ? (
                                    <span className="text-[10px] text-green-600 font-medium flex items-center gap-1">
                                      <CheckCircle2 size={11} /> Imported
                                    </span>
                                  ) : (
                                    <button type="button"
                                      onClick={() => importAdvance(r)}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-semibold transition-colors">
                                      <Plus size={10} /> Import
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* No PMS advances in range */}
                {!advancesLoading && pmsAdvancesInRange.length === 0 && !advancesError && (
                  <div className="mx-5 mb-4 flex items-center gap-2 py-3 px-4 bg-gray-50 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400">
                    <DollarSign size={14} className="opacity-40" />
                    {pmsAdvances.length > 0
                      ? `No advances found within ${fmt(fromDate)} → ${fmt(toDate)} (${pmsAdvances.length} record${pmsAdvances.length !== 1 ? 's' : ''} outside this range in PMS)`
                      : 'No advance records found in PMS for this employee'}
                  </div>
                )}

                <div className="px-5 pb-4">
                  {/* Manual add form */}
                  <p className="text-xs font-semibold text-gray-600 mb-2 mt-1">Add Advance Manually</p>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Date Received</label>
                        <input type="date" className={inputCls} value={advanceDraft.date || ''}
                          min={fromDate} max={toDate}
                          onChange={e => setAdvanceDraft(p => ({ ...p, date: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Amount & Currency</label>
                        <div className="flex gap-1.5">
                          <select
                            className="px-2 py-2 text-xs border border-gray-300 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-400 min-w-[72px]"
                            value={advanceDraft.currency || 'INR'}
                            onChange={e => setAdvanceDraft(p => ({ ...p, currency: e.target.value }))}>
                            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} {c.symbol}</option>)}
                          </select>
                          <input type="number" className={inputCls} placeholder="0.00"
                            value={advanceDraft.amount || ''}
                            onChange={e => setAdvanceDraft(p => ({ ...p, amount: Number(e.target.value) }))} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Purpose</label>
                        <input className={inputCls} placeholder="e.g. Travel advance"
                          value={advanceDraft.purpose || ''}
                          onChange={e => setAdvanceDraft(p => ({ ...p, purpose: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Reference / Voucher No.</label>
                        <input className={inputCls} placeholder="e.g. ADV-2026-001"
                          value={advanceDraft.reference || ''}
                          onChange={e => setAdvanceDraft(p => ({ ...p, reference: e.target.value }))} />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button type="button" onClick={addAdvance}
                        disabled={!advanceDraft.amount || !advanceDraft.date}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-semibold transition-colors">
                        <Plus size={13} /> Add Advance
                      </button>
                    </div>
                  </div>

                  {/* Imported / manually added advances list */}
                  {advancesInRange.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-gray-200 mt-4 mb-3">
                      <table className="min-w-full text-xs divide-y divide-gray-100">
                        <thead className="bg-gray-50">
                          <tr>
                            {['Date', 'Purpose', 'Voucher / Reference', 'Currency', 'Amount', ''].map(h => (
                              <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {advancesInRange.map(a => (
                            <tr key={a.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2.5 whitespace-nowrap">{a.date ? fmt(a.date) : '—'}</td>
                              <td className="px-3 py-2.5 text-gray-700">{a.purpose || '—'}</td>
                              <td className="px-3 py-2.5 font-mono text-gray-400 text-[11px]">{a.reference || '—'}</td>
                              <td className="px-3 py-2.5 text-gray-600">{a.currency || 'INR'}</td>
                              <td className="px-3 py-2.5 font-bold text-violet-700 whitespace-nowrap">
                                {CURRENCIES.find(c => c.code === (a.currency || 'INR'))?.symbol}{' '}
                                {a.amount.toLocaleString('en-IN')}
                              </td>
                              <td className="px-3 py-2.5">
                                <button type="button" onClick={() => removeAdvance(a.id)} className="text-red-400 hover:text-red-600">
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Net payable summary */}
                  {advancesInRange.length > 0 && (
                    <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-3 mt-2 flex flex-wrap items-center justify-between gap-3 text-sm">
                      <div className="flex flex-wrap gap-6 items-center">
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Grand Total</p>
                          <p className="font-bold text-gray-800">{formatINR(grandTotal)}</p>
                        </div>
                        <span className="text-gray-400 text-base">−</span>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Advance (INR)</p>
                          <p className="font-bold text-violet-700">{formatINR(advanceTotal)}</p>
                        </div>
                        <span className="text-gray-400 text-base">=</span>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Net Payable</p>
                          <p className="text-xl font-extrabold text-green-700">{formatINR(Math.max(0, grandTotal - advanceTotal))}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {advancesInRange.length === 0 && pmsAdvancesInRange.length === 0 && !advancesLoading && (
                    <div className="flex items-center gap-2 py-4 justify-center border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-xs mt-3">
                      <DollarSign size={16} className="opacity-40" />
                      No advances recorded for this date range
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Employee Remarks ───────────────────────────────────────────────────── */}
      {fetched && !isProxyMode && (
        <div className="max-w-4xl mx-auto px-4 mt-5">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-1">
              <MessageSquare size={15} className="text-blue-500" />
              Employee Remarks
            </h3>
            <p className="text-xs text-gray-400 mb-3">Add any comments or notes before submitting your claim</p>
            <textarea
              rows={4}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white resize-none"
              placeholder="Enter your remarks here (optional)…"
              value={employeeRemarks}
              onChange={e => setEmployeeRemarks(e.target.value)}
            />
            {employeeRemarks.trim() && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-gray-400">{employeeRemarks.length} character{employeeRemarks.length !== 1 ? 's' : ''}</span>
                <button type="button" onClick={() => setEmployeeRemarks('')}
                  className="text-xs text-red-400 hover:text-red-600 underline transition-colors">
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Step 9: Claim Review & Submit ──────────────────────────────────────── */}
      {fetched && !isProxyMode && (
        <div className="max-w-4xl mx-auto px-4 pb-40">
          <div className="bg-white border-2 border-blue-200 rounded-2xl shadow-lg overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 size={18} /> Step 10 — Claim Review &amp; Submit
              </h2>
              <p className="text-blue-100 text-xs mt-0.5">All steps consolidated — verify before submitting</p>
            </div>

            <div className="p-6 space-y-4">

              {/* ── Row 1: Date Range + Assignments ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Step 1 */}
                <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Step 1 — Date Range</p>
                  <p className="text-sm font-bold text-gray-800">
                    {fmt(fromDate)} <span className="text-gray-400 font-normal">→</span> {fmt(toDate)}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {assignmentDates.length} day{assignmentDates.length !== 1 ? 's' : ''} in period
                    {currentUser?.email && <span className="ml-1 text-gray-400">· {currentUser.email}</span>}
                  </p>
                </div>

                {/* Step 2 */}
                <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Step 2 — Assignments</p>
                  {assignments.length > 0 ? (
                    <div className="space-y-1.5">
                      {assignments.slice(0, 2).map((a, i) => (
                        <div key={i} className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />
                            <span className="text-xs text-gray-700 truncate">{a.courseName || a.clientName}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 ml-5 text-[10px] text-gray-500">
                            {a.scid && <span>SCID: <span className="font-mono text-cyan-700">{a.scid}</span></span>}
                            {a.noOfParticipants != null && <span>Pax: <span className="font-semibold text-indigo-700">{a.noOfParticipants}</span></span>}
                            {(a.startTime || a.endTime) && (
                              <span>{a.startTime || '—'} – {a.endTime || '—'}</span>
                            )}
                          </div>
                        </div>
                      ))}
                      {assignments.length > 2 && (
                        <p className="text-xs text-gray-400 ml-5">+{assignments.length - 2} more</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-amber-600 flex items-center gap-1"><AlertCircle size={11} /> No assignments found</p>
                  )}
                </div>
              </div>

              {/* ── Row 2: Leave Dates + DA ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Step 3 */}
                <div className="rounded-xl border border-orange-200 p-4 bg-orange-50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400 mb-1">Step 3 — Leave Dates</p>
                  {leaveDates.size > 0 ? (
                    <>
                      <p className="text-sm font-bold text-orange-700">{leaveDates.size} leave day{leaveDates.size !== 1 ? 's' : ''} marked</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {Array.from(leaveDates).sort().map(d => (
                          <span key={d} className="px-1.5 py-0.5 rounded bg-orange-200 text-orange-800 text-[10px] font-medium">{fmt(d)}</span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-green-700 flex items-center gap-1"><CheckCircle2 size={11} /> No leave days — full DA eligible</p>
                  )}
                </div>

                {/* Step 4 */}
                <div className="rounded-xl border border-green-200 p-4 bg-green-50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-green-400 mb-1">Step 4 — DA Eligibility</p>
                  {/* Individual currency amounts */}
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    {autoDATotal > 0 && (
                      <span className="text-xl font-extrabold text-green-700">{formatINR(autoDATotal)}</span>
                    )}
                    {Object.entries(foreignDAMap).map(([cur, amt]) => (
                      <span key={cur} className="text-xl font-extrabold text-green-700">{formatDaCurrency(amt, cur)}</span>
                    ))}
                    {autoDATotal === 0 && Object.keys(foreignDAMap).length === 0 && (
                      <span className="text-xl font-extrabold text-green-700">₹0</span>
                    )}
                  </div>
                  {/* Combined INR equivalent when foreign DA exists */}
                  {Object.keys(foreignDAMap).length > 0 && (
                    <div className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-100 border border-green-300">
                      <span className="text-[10px] text-green-600 font-semibold uppercase tracking-wide">Total DA (INR equiv.)</span>
                      <span className="text-sm font-extrabold text-green-800 ml-auto">
                        {formatINR(autoDATotal + foreignDATotalINR)}
                      </span>
                    </div>
                  )}
                  <div className="mt-1 space-y-0.5 text-xs text-gray-600">
                    <p>{daRows.filter(r => r.amount > 0).length} eligible day{daRows.filter(r => r.amount > 0).length !== 1 ? 's' : ''} × rate</p>
                    {Object.keys(foreignDAMap).length > 0 && (
                      <p className="text-green-600">
                        Foreign DA converted @ {Object.entries(foreignDAMap).map(([c]) => `${c} = ₹${FX_TO_INR[c] ?? '?'}`).join(', ')} {fxSource ? `live · ${fxUpdatedAt ? new Date(fxUpdatedAt).toLocaleDateString('en-IN') : ''}` : 'indicative'}
                      </p>
                    )}
                    {leaveDates.size > 0 && (
                      <p className="text-orange-600">{leaveDates.size} leave day{leaveDates.size !== 1 ? 's' : ''} deducted</p>
                    )}
                    {daRows.filter(r => r.amount === 0 && !leaveDates.has(r.iso)).length > 0 && (
                      <p className="text-red-500">{daRows.filter(r => r.amount === 0 && !leaveDates.has(r.iso)).length} ineligible day{daRows.filter(r => r.amount === 0 && !leaveDates.has(r.iso)).length !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Row 3: Flights + Lodging ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Step 5 */}
                <div className="rounded-xl border border-blue-200 p-4 bg-blue-50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-1">Step 5 — Flights</p>
                  {pmsFlights.length > 0 ? (
                    <>
                      <p className="text-sm font-bold text-blue-700">{pmsFlights.length} flight{pmsFlights.length !== 1 ? 's' : ''} in PMS</p>
                      <div className="mt-1 space-y-0.5">
                        {pmsFlights.slice(0, 2).map((f, i) => (
                          <p key={i} className="text-xs text-gray-600 truncate">
                            {f.airlines_name || '—'} · {f.from_city} → {f.to_city} · {parseDT(f.departure_date) ? fmt(parseDT(f.departure_date)) : '—'}
                          </p>
                        ))}
                        {pmsFlights.length > 2 && <p className="text-xs text-gray-400">+{pmsFlights.length - 2} more</p>}
                      </div>
                      <p className="text-xs text-blue-600 mt-1">{importedTripIds.size} added to bill</p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Info size={11} /> No flights in PMS for this range</p>
                  )}
                </div>

                {/* Step 6 */}
                <div className="rounded-xl border border-teal-200 p-4 bg-teal-50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-teal-400 mb-1">Step 6 — Lodging</p>
                  {lodgingEntries.length > 0 ? (
                    <>
                      <p className="text-xl font-extrabold text-teal-700">{formatINR(lodgingTotal)}</p>
                      <div className="mt-1 space-y-0.5 text-xs text-gray-600">
                        {lodgingEntries.map((l, i) => (
                          <p key={i} className="truncate">
                            {l.hotelName || '—'} · {l.nights} night{l.nights !== 1 ? 's' : ''}
                            {l.ratePerNight > 0 ? ` · ${formatINR(l.ratePerNight)}/night` : ' · rate pending'}
                          </p>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Info size={11} /> No lodging added</p>
                  )}
                </div>
              </div>

              {/* ── Row 4: Travel Bills + Misc ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Step 7 */}
                <div className="rounded-xl border border-indigo-200 p-4 bg-indigo-50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1">Step 7 — Travel Bills</p>
                  {travelBills.length > 0 ? (
                    <>
                      <p className="text-xl font-extrabold text-indigo-700">{formatINR(travelTotal)}</p>
                      <div className="mt-1 space-y-0.5 text-xs text-gray-600">
                        {travelBills.map((b, i) => (
                          <p key={i} className="truncate">{b.travelType} · {b.from} → {b.to} · {formatINR(b.amount)}</p>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Info size={11} /> No travel bills added</p>
                  )}
                </div>

                {/* Step 8 */}
                <div className="rounded-xl border border-purple-200 p-4 bg-purple-50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-purple-400 mb-1">Step 8 — Miscellaneous</p>
                  {miscExpenses.length > 0 ? (
                    <>
                      <p className="text-xl font-extrabold text-purple-700">{formatINR(miscTotal)}</p>
                      <div className="mt-1 space-y-0.5 text-xs text-gray-600">
                        {miscExpenses.map((e, i) => (
                          <p key={i} className="truncate">{e.expenseType} · {formatINR(e.amount)}</p>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Info size={11} /> No misc expenses added</p>
                  )}
                </div>
              </div>

              {/* ── Row 5: Advance Taken ── */}
              <div className="rounded-xl border border-violet-200 p-4 bg-violet-50">
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-400 mb-2">Step 9 — Advance Taken</p>
                {(pmsAdvancesInRange.length > 0 || advances.length > 0) ? (
                  <div className="space-y-2">
                    {/* PMS advances */}
                    {pmsAdvancesInRange.length > 0 && (
                      <div>
                        <p className="text-[10px] text-violet-500 font-semibold uppercase tracking-wide mb-1">From PMS</p>
                        <div className="space-y-1">
                          {pmsAdvancesInRange.map((r, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-gray-600 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
                                {parseDT(r.Date) ? fmt(parseDT(r.Date)) : (r.Date || '—')}
                                {r.Type && <span className="text-gray-400">· {r.Type}</span>}
                                {r.TABillID && r.TABillID !== '0' && <span className="text-gray-400 font-mono">· #{r.TABillID}</span>}
                              </span>
                              <span className="font-bold text-violet-700 whitespace-nowrap ml-3">
                                {Number(r.Amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })} {r.Currency || 'INR'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Manually added advances */}
                    {advances.length > 0 && (
                      <div className={pmsAdvancesInRange.length > 0 ? 'pt-2 border-t border-violet-200' : ''}>
                        {pmsAdvancesInRange.length > 0 && (
                          <p className="text-[10px] text-violet-500 font-semibold uppercase tracking-wide mb-1">Manually Added</p>
                        )}
                        <div className="space-y-1">
                          {advances.map((a, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-gray-600 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                                {a.date ? fmt(a.date) : '—'}
                                {a.purpose && <span className="text-gray-400">· {a.purpose}</span>}
                              </span>
                              <span className="font-bold text-violet-700 whitespace-nowrap ml-3">
                                {a.amount.toLocaleString('en-IN')} {a.currency}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Total deduction */}
                    <div className="pt-2 border-t border-violet-300 flex items-center justify-between">
                      <span className="text-xs font-semibold text-violet-700">Total Advance Deduction (INR)</span>
                      <span className="text-base font-extrabold text-violet-800">{formatINR(advanceTotal)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Info size={11} /> No advances recorded for this period
                  </p>
                )}
              </div>

              {/* ── Grand Total Banner ── */}
              <div className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-6 text-white text-center">
                  {/* INR DA */}
                  <div>
                    <p className="text-[10px] opacity-70 uppercase tracking-wider">DA {Object.keys(foreignDAMap).length > 0 ? '(INR)' : ''}</p>
                    <p className="text-base font-bold">{formatINR(autoDATotal)}</p>
                  </div>
                  {/* Foreign currency DA */}
                  {Object.entries(foreignDAMap).map(([cur, amt]) => (
                    <div key={cur}>
                      <p className="text-[10px] opacity-70 uppercase tracking-wider">DA ({cur})</p>
                      <p className="text-base font-bold">{formatDaCurrency(amt, cur)}</p>
                    </div>
                  ))}
                  {/* Travel, Lodging, Misc */}
                  {[
                    { label: 'Travel', value: travelTotal },
                    { label: 'Lodging', value: lodgingTotal },
                    { label: 'Misc', value: miscTotal },
                  ].map(item => (
                    <div key={item.label}>
                      <p className="text-[10px] opacity-70 uppercase tracking-wider">{item.label}</p>
                      <p className="text-base font-bold">{formatINR(item.value)}</p>
                    </div>
                  ))}
                  {advanceTotal > 0 && (
                    <div>
                      <p className="text-[10px] opacity-70 uppercase tracking-wider">Advance Taken</p>
                      <p className="text-base font-bold text-red-300">− {formatINR(advanceTotal)}</p>
                    </div>
                  )}
                  <div className="border-l border-blue-400 pl-6">
                    <p className="text-[10px] opacity-70 uppercase tracking-wider">Grand Total (INR)</p>
                    <p className="text-2xl font-extrabold">{formatINR(Math.max(0, grandTotal - advanceTotal))}</p>
                    {Object.keys(foreignDAMap).length > 0 && (
                      <p className="text-[10px] opacity-75 mt-0.5">
                        Incl. {Object.entries(foreignDAMap).map(([c, a]) => `${formatDaCurrency(a, c)} @ ~${FX_TO_INR[c] ?? '?'}₹`).join(' + ')} {fxSource ? `live · ${fxUpdatedAt ? new Date(fxUpdatedAt).toLocaleDateString('en-IN') : ''}` : 'indicative'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => navigate('/claims')}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-semibold border border-white/30 transition-colors">
                    <Save size={15} /> Save Draft
                  </button>
                  <button type="button" onClick={handleSubmit}
                    disabled={submitSuccess || isSubmitting}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-white hover:bg-blue-50 text-blue-700 text-sm font-bold transition-colors shadow disabled:opacity-60">
                    {submitSuccess ? <CheckCircle2 size={15} className="text-green-600" /> : isSubmitting ? <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin inline-block" /> : <Send size={15} />}
                    {submitSuccess ? 'Submitted!' : isSubmitting ? 'Saving...' : 'Submit Claim'}
                  </button>
                </div>
              </div>

              {/* ── Readiness Checklist ── */}
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-600 mb-3 uppercase tracking-wider">Pre-submission Checklist</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { ok: !!fromDate && !!toDate,          label: 'Date range selected' },
                    { ok: assignments.length > 0,           label: 'At least one assignment fetched' },
                    { ok: true,                             label: `Leave dates reviewed (${leaveDates.size} marked)` },
                    { ok: autoDATotal > 0 || Object.keys(foreignDAMap).length > 0, label: 'DA calculated (eligible days found)' },
                    { ok: lodgingEntries.length > 0 || pmsAccom.length === 0, label: 'Lodging reviewed' },
                    { ok: travelBills.length > 0 || pmsFlights.length === 0, label: 'Travel bills reviewed' },
                    { ok: grandTotal > 0,                   label: 'Claim has a non-zero total' },
                    { ok: lodgingEntries.every(l => l.ratePerNight > 0), label: 'All lodging rates entered' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {item.ok
                        ? <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
                        : <AlertCircle size={13} className="text-amber-500 flex-shrink-0" />}
                      <span className={item.ok ? 'text-gray-700' : 'text-amber-700 font-medium'}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── Sticky bottom bar ─────────────────────────────────────────────────── */}
      {fetched && !isProxyMode && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-xl">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-blue-700">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <CheckCircle2 size={16} />
              </div>
              <span className="text-sm font-bold">Claim Summary</span>
            </div>
            <div className="flex-1 flex flex-wrap items-center gap-5 text-center">
              {/* DA — INR */}
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">DA {Object.keys(foreignDAMap).length > 0 ? '(INR)' : ''}</p>
                <p className="text-sm font-bold text-green-700">{formatINR(autoDATotal)}</p>
              </div>
              {/* DA — foreign currencies */}
              {Object.entries(foreignDAMap).map(([cur, amt]) => (
                <div key={cur}>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">DA ({cur})</p>
                  <p className="text-sm font-bold text-green-700">{formatDaCurrency(amt, cur)}</p>
                </div>
              ))}
              {/* Travel, Lodging, Misc */}
              {[
                { label: 'Travel', value: travelTotal, color: 'text-indigo-700' },
                { label: 'Lodging', value: lodgingTotal, color: 'text-teal-700' },
                { label: 'Misc', value: miscTotal, color: 'text-purple-700' },
              ].map((item, i) => (
                <div key={i}>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">{item.label}</p>
                  <p className={`text-sm font-bold ${item.color}`}>{formatINR(item.value)}</p>
                </div>
              ))}
              {advanceTotal > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Advance Taken</p>
                  <p className="text-sm font-bold text-red-600">− {formatINR(advanceTotal)}</p>
                </div>
              )}
              <div className="border-l border-gray-200 pl-4">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Grand Total (INR)</p>
                <p className="text-lg font-extrabold text-blue-700">{formatINR(Math.max(0, grandTotal - advanceTotal))}</p>
                {Object.keys(foreignDAMap).length > 0 && (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Incl. {Object.entries(foreignDAMap).map(([c, a]) => `${formatDaCurrency(a, c)} @ ~${FX_TO_INR[c] ?? '?'}₹`).join(' + ')} {fxSource ? `live · ${fxUpdatedAt ? new Date(fxUpdatedAt).toLocaleDateString('en-IN') : ''}` : 'indicative'}
                  </p>
                )}
              </div>
              {leaveDates.size > 0 && (
                <div className="px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold">
                  {leaveDates.size} leave day{leaveDates.size !== 1 ? 's' : ''} excluded
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <button type="button" onClick={() => navigate('/claims')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors">
                <Save size={14} /> Save Draft
              </button>
              <button type="button" onClick={handleSubmit}
                disabled={submitSuccess || isSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors disabled:opacity-60">
                {submitSuccess ? <CheckCircle2 size={14} /> : isSubmitting ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> : <Send size={14} />}
                {submitSuccess ? 'Submitted!' : isSubmitting ? 'Saving...' : 'Submit Claim'}
              </button>
            </div>
            {submitError && (
              <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <span className="font-semibold">Error:</span> {submitError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
