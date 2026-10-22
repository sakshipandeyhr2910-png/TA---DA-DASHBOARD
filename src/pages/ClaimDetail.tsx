import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { User, ClaimStatus, UserRole, ClaimAdvanceItem } from '../types';
import { mockClaims, mockStatusHistory } from '../data/mockClaims';
import { getClaims, saveClaim, saveClaimAsync, getLineItems, getAdvanceRemaining, refreshClaims, getFromStorage, getPaidDADates, getPaidNonDaLineItems } from '../services/storageService';
import { sendActionEmail } from '../services/emailService';
import { mapRawToAssignment, fmtAssignmentDate, normalizeLeave, isApprovedLeave, isPendingLeave, isCancelledLeave, parseDT, parseTM, inferCountryFromCity, type ParsedAssignment, type ParsedLeave } from '../lib/assignmentMapper';
import { useLiveRates, convertToINR } from '../lib/currencyRates';
import type { ClaimLineItem } from '../types';
import ClaimTimeline from '../components/ClaimTimeline';
import AmountSummary from '../components/AmountSummary';
import AuditTimeline from '../components/AuditTimeline';
import RemarksPanel from '../components/RemarksPanel';
import { TravelTimeline } from '../components/TravelTimeline';
import DADayBreakdown from '../components/DADayBreakdown';
import { ResourceLeavePanel } from '../components/ResourceLeavePanel';
import LodgingStaybackPanel from '../components/LodgingStaybackPanel';
import CabConveyancePanel from '../components/CabConveyancePanel';
import RouteFareModal from '../components/RouteFareModal';

// ─── Props ─────────────────────────────────────────────────────────────────

interface ClaimDetailProps {
  currentUser: User;
}

// ─── Tab definitions ───────────────────────────────────────────────────────

type TabId =
  | 'overview'
  | 'travel'
  | 'da'
  | 'lodging'
  | 'cab'
  | 'other'
  | 'documents'
  | 'timeline'
  | 'audit'
  | 'payment';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',   label: 'Overview' },
];

// ─── Status badge ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  'UNDER REVIEW': 'bg-yellow-100 text-yellow-700',
  'CLARIFICATION REQUIRED': 'bg-orange-100 text-orange-700',
  RESUBMITTED: 'bg-indigo-100 text-indigo-700',
  APPROVED: 'bg-green-100 text-green-700',
  'PARTIALLY APPROVED': 'bg-teal-100 text-teal-700',
  REJECTED: 'bg-red-100 text-red-700',
  'ON HOLD': 'bg-pink-100 text-pink-700',
  'PAYMENT PENDING': 'bg-purple-100 text-purple-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-gray-200 text-gray-500',
  REOPENED: 'bg-cyan-100 text-cyan-700',
};

const PENDING_COLORS: Record<string, string> = {
  Trainer: 'bg-amber-100 text-amber-700',
  'HR/Admin': 'bg-blue-100 text-blue-700',
  Finance: 'bg-violet-100 text-violet-700',
  Approver: 'bg-orange-100 text-orange-700',
  Reviewer: 'bg-indigo-100 text-indigo-700',
};

// DA rates — exact copy of CreateTADABill DA_POLICY so HR Admin shows identical amounts
const HR_DA_POLICY: Record<string, { rate: number; currency: string }> = {
  'India': { rate: 950, currency: 'INR' },
  'Nepal': { rate: 1100, currency: 'INR' }, 'Bangladesh': { rate: 1100, currency: 'INR' },
  'Myanmar': { rate: 1100, currency: 'INR' }, 'Burma': { rate: 1100, currency: 'INR' },
  'Bhutan': { rate: 1100, currency: 'INR' }, 'Sri Lanka': { rate: 1100, currency: 'INR' },
  'Dubai': { rate: 75, currency: 'AED' }, 'United Arab Emirates': { rate: 75, currency: 'AED' }, 'UAE': { rate: 75, currency: 'AED' },
  'UK': { rate: 50, currency: 'USD' }, 'Singapore': { rate: 50, currency: 'USD' }, 'Maldives': { rate: 40, currency: 'USD' },
  'USA': { rate: 50, currency: 'USD' }, 'United States': { rate: 50, currency: 'USD' },
  'South Africa': { rate: 40, currency: 'USD' }, 'Australia': { rate: 50, currency: 'USD' },
  'Thailand': { rate: 30, currency: 'USD' }, 'Saudi Arabia': { rate: 30, currency: 'USD' },
  'Malaysia': { rate: 30, currency: 'USD' }, 'Philippines': { rate: 30, currency: 'USD' },
  'Canada': { rate: 50, currency: 'USD' }, 'Egypt': { rate: 25, currency: 'USD' },
  'Denmark': { rate: 50, currency: 'USD' }, 'Indonesia': { rate: 30, currency: 'USD' },
  'Kenya': { rate: 25, currency: 'USD' }, 'Nigeria': { rate: 20, currency: 'USD' },
  'Oman': { rate: 40, currency: 'USD' }, 'Kuwait': { rate: 30, currency: 'USD' },
  'Qatar': { rate: 30, currency: 'USD' }, 'Bahrain': { rate: 30, currency: 'USD' },
  'Jordan': { rate: 30, currency: 'USD' }, 'Iraq': { rate: 40, currency: 'USD' },
  'Hong Kong': { rate: 40, currency: 'USD' }, 'Japan': { rate: 40, currency: 'USD' },
  'China': { rate: 40, currency: 'USD' }, 'South Korea': { rate: 40, currency: 'USD' },
  'Taiwan': { rate: 40, currency: 'USD' }, 'New Zealand': { rate: 40, currency: 'USD' },
  'Germany': { rate: 50, currency: 'USD' }, 'France': { rate: 50, currency: 'USD' },
  'Italy': { rate: 50, currency: 'USD' }, 'Spain': { rate: 50, currency: 'USD' },
  'Netherlands': { rate: 50, currency: 'USD' }, 'Belgium': { rate: 50, currency: 'USD' },
  'Switzerland': { rate: 50, currency: 'USD' }, 'Sweden': { rate: 50, currency: 'USD' },
  'Finland': { rate: 50, currency: 'USD' }, 'Norway': { rate: 50, currency: 'USD' },
  'Ireland': { rate: 40, currency: 'USD' }, 'Portugal': { rate: 40, currency: 'USD' },
  'Greece': { rate: 50, currency: 'USD' }, 'Austria': { rate: 50, currency: 'USD' },
  'Poland': { rate: 40, currency: 'USD' }, 'Russia': { rate: 40, currency: 'USD' },
  'Turkey': { rate: 30, currency: 'USD' }, 'Israel': { rate: 50, currency: 'USD' },
  'Kazakhstan': { rate: 30, currency: 'USD' }, 'Georgia': { rate: 40, currency: 'USD' },
  'Pakistan': { rate: 20, currency: 'USD' }, 'Tanzania': { rate: 25, currency: 'USD' },
  'Ghana': { rate: 30, currency: 'USD' }, 'Ethiopia': { rate: 30, currency: 'USD' },
  'Mauritius': { rate: 30, currency: 'USD' }, 'Zambia': { rate: 25, currency: 'USD' },
  'Zimbabwe': { rate: 30, currency: 'USD' }, 'Namibia': { rate: 30, currency: 'USD' },
  'Angola': { rate: 30, currency: 'USD' }, 'Mozambique': { rate: 25, currency: 'USD' },
  'Amsterdam': { rate: 50, currency: 'USD' }, 'Vietnam': { rate: 20, currency: 'USD' },
  'Cambodia': { rate: 20, currency: 'USD' }, 'Brunei': { rate: 30, currency: 'USD' },
  'Laos': { rate: 20, currency: 'USD' }, 'Mexico': { rate: 20, currency: 'USD' },
  'Brazil': { rate: 30, currency: 'USD' }, 'Argentina': { rate: 30, currency: 'USD' },
  'Seychelles': { rate: 30, currency: 'USD' }, 'Fiji': { rate: 30, currency: 'USD' },
  'Sierra Leone': { rate: 50, currency: 'USD' }, 'Algeria': { rate: 25, currency: 'USD' },
};

function getHrDaInfo(country: string): { rate: number; currency: string } {
  if (!country) return HR_DA_POLICY['India'];
  if (HR_DA_POLICY[country]) return HR_DA_POLICY[country];
  const key = Object.keys(HR_DA_POLICY).find(k => k.toLowerCase() === country.toLowerCase());
  if (key) return HR_DA_POLICY[key];
  return { rate: 50, currency: 'USD' }; // unknown international → default USD 50
}

// Legacy fallback rates — replaced by live rates from useLiveRates() hook at runtime
const FX_TO_INR: Record<string, number> = {
  'INR': 1,
  'USD': 84,
  'AED': 22.9,
  'EUR': 91,
  'GBP': 107,
  'SGD': 63,
  'AUD': 55,
  'CAD': 62,
  'JPY': 0.56,
  'SAR': 22.4,
  'QAR': 23.1,
  'KWD': 274,
  'BHD': 223,
  'OMR': 219,
  'MYR': 19,
  'THB': 2.4,
  'ZAR': 4.6,
};

// FX_TO_INR kept as static fallback; live conversion done via useLiveRates() + convertToINR() inside the component

// Delhi-NCR cities where DA is not applicable unless trainer stays in an apartment
const DELHI_NCR_CITIES = new Set([
  'delhi', 'new delhi', 'noida', 'greater noida', 'gurgaon', 'gurugram',
  'faridabad', 'ghaziabad', 'manesar', 'bahadurgarh', 'sonipat', 'rohtak',
  'dwarka', 'south delhi', 'north delhi', 'east delhi', 'west delhi',
  'central delhi', 'delhi ncr', 'ncr', 'ncr delhi',
]);

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status.toUpperCase()] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${cls}`}>
      {status}
    </span>
  );
}

function PendingBadge({ pendingWith }: { pendingWith: string | null }) {
  if (!pendingWith) return null;
  const cls = PENDING_COLORS[pendingWith] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cls}`}>
      Pending with: {pendingWith}
    </span>
  );
}

// ─── Risk flags row ────────────────────────────────────────────────────────

function RiskFlags({ claim }: { claim: (typeof mockClaims)[number] }) {
  const flags: { label: string; color: string }[] = [];
  if (claim.exceptionFlag) flags.push({ label: 'Exception', color: 'bg-orange-100 text-orange-700' });
  if (claim.missingDocumentFlag) flags.push({ label: 'Missing Docs', color: 'bg-red-100 text-red-700' });
  if (claim.slaBreached) flags.push({ label: 'SLA Breached', color: 'bg-red-200 text-red-800' });
  if (claim.ledgerMismatchFlag) flags.push({ label: 'Ledger Mismatch', color: 'bg-yellow-100 text-yellow-700' });
  if (claim.highValue) flags.push({ label: 'High Value', color: 'bg-purple-100 text-purple-700' });
  if ((claim.recoverableAmount ?? 0) > 0) flags.push({ label: 'Recoverable', color: 'bg-pink-100 text-pink-700' });
  if (flags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {flags.map((f) => (
        <span key={f.label} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${f.color}`}>
          {f.label}
        </span>
      ))}
    </div>
  );
}

// ─── Modal ─────────────────────────────────────────────────────────────────

interface ActionModalProps {
  title: string;
  label: string;
  confirmLabel?: string;
  confirmColor?: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

function ActionModal({
  title,
  label,
  confirmLabel = 'Confirm',
  confirmColor = 'bg-blue-600 hover:bg-blue-700',
  onConfirm,
  onClose,
}: ActionModalProps) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">{title}</h3>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <textarea
          rows={4}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Enter reason / remarks..."
        />
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { if (reason.trim()) { onConfirm(reason.trim()); onClose(); } }}
            disabled={!reason.trim()}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 ${confirmColor}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Action types ──────────────────────────────────────────────────────────

type ActionKey =
  | 'edit'
  | 'respond'
  | 'start-review'
  | 'send-clarification'
  | 'approve'
  | 'partial-approve'
  | 'reject'
  | 'hold'
  | 'mark-paid'
  | 'reopen'
  | 'cancel'
  | 'start-review-again';

interface ActionConfig {
  key: ActionKey;
  label: string;
  variant: 'primary' | 'danger' | 'warning' | 'secondary' | 'success';
  needsModal?: boolean;
  modalTitle?: string;
  modalLabel?: string;
  modalConfirmLabel?: string;
}

function getAvailableActions(
  role: UserRole,
  status: string
): ActionConfig[] {
  const s = status.toUpperCase();
  const actions: ActionConfig[] = [];

  if (role === 'Trainer') {
    if (s === 'DRAFT') {
      actions.push({ key: 'edit', label: 'Edit Draft', variant: 'primary' });
    }
    if (s === 'CLARIFICATION REQUIRED') {
      actions.push({
        key: 'respond',
        label: 'Respond to Clarification',
        variant: 'primary',
        needsModal: true,
        modalTitle: 'Respond to Clarification',
        modalLabel: 'Your response',
        modalConfirmLabel: 'Submit Response',
      });
    }
  }

  if (role === 'HRAdmin') {
    // Always show full action set to HR Admin regardless of claim status
    if (s !== 'UNDER REVIEW') {
      actions.push({ key: 'start-review-again', label: s === 'SUBMITTED' || s === 'RESUBMITTED' ? 'Start Review' : 'Start Review Again', variant: 'primary' });
    }
    actions.push({
      key: 'send-clarification',
      label: 'Send Clarification',
      variant: 'warning',
      needsModal: true,
      modalTitle: 'Send Clarification Request',
      modalLabel: 'Clarification required (visible to trainer)',
      modalConfirmLabel: 'Send',
    });
    actions.push({
      key: 'approve',
      label: 'Approve',
      variant: 'success',
      needsModal: true,
      modalTitle: 'Approve Claim',
      modalLabel: 'Approval remarks',
      modalConfirmLabel: 'Approve',
    });
    actions.push({
      key: 'partial-approve',
      label: 'Partially Approve',
      variant: 'warning',
      needsModal: true,
      modalTitle: 'Partially Approve Claim',
      modalLabel: 'Reason for partial approval and deduction details',
      modalConfirmLabel: 'Partially Approve',
    });
    actions.push({
      key: 'reject',
      label: 'Reject',
      variant: 'danger',
      needsModal: true,
      modalTitle: 'Reject Claim',
      modalLabel: 'Reason for rejection',
      modalConfirmLabel: 'Reject',
    });
    actions.push({
      key: 'hold',
      label: 'Hold',
      variant: 'secondary',
      needsModal: true,
      modalTitle: 'Place Claim On Hold',
      modalLabel: 'Reason for hold',
      modalConfirmLabel: 'Place On Hold',
    });
  }

  if (role === 'Finance') {
    if (s === 'PAYMENT PENDING') {
      actions.push({
        key: 'mark-paid',
        label: 'Mark as Paid',
        variant: 'success',
        needsModal: true,
        modalTitle: 'Mark Claim as Paid',
        modalLabel: 'Payment reference / UTR',
        modalConfirmLabel: 'Mark Paid',
      });
    }
  }

  if (role === 'SuperAdmin') {
    // SuperAdmin gets all HR actions + Reopen + Cancel
    if (s === 'SUBMITTED' || s === 'RESUBMITTED') {
      actions.push({ key: 'start-review', label: 'Start Review', variant: 'primary' });
    }
    if (s === 'UNDER REVIEW') {
      actions.push({
        key: 'send-clarification',
        label: 'Send Clarification',
        variant: 'warning',
        needsModal: true,
        modalTitle: 'Send Clarification Request',
        modalLabel: 'Clarification required',
        modalConfirmLabel: 'Send',
      });
      actions.push({
        key: 'approve',
        label: 'Approve',
        variant: 'success',
        needsModal: true,
        modalTitle: 'Approve Claim',
        modalLabel: 'Approval remarks',
        modalConfirmLabel: 'Approve',
      });
      actions.push({
        key: 'partial-approve',
        label: 'Partially Approve',
        variant: 'warning',
        needsModal: true,
        modalTitle: 'Partially Approve Claim',
        modalLabel: 'Reason for partial approval',
        modalConfirmLabel: 'Partially Approve',
      });
      actions.push({
        key: 'reject',
        label: 'Reject',
        variant: 'danger',
        needsModal: true,
        modalTitle: 'Reject Claim',
        modalLabel: 'Reason for rejection',
        modalConfirmLabel: 'Reject',
      });
      actions.push({
        key: 'hold',
        label: 'Hold',
        variant: 'secondary',
        needsModal: true,
        modalTitle: 'Place On Hold',
        modalLabel: 'Reason for hold',
        modalConfirmLabel: 'Place On Hold',
      });
    }
    if (s === 'PAYMENT PENDING') {
      actions.push({
        key: 'mark-paid',
        label: 'Mark as Paid',
        variant: 'success',
        needsModal: true,
        modalTitle: 'Mark Claim as Paid',
        modalLabel: 'Payment reference / UTR',
        modalConfirmLabel: 'Mark Paid',
      });
    }
    if (
      s === 'REJECTED' ||
      s === 'APPROVED' ||
      s === 'PARTIALLY APPROVED' ||
      s === 'PAID' ||
      s === 'ON HOLD' ||
      s === 'CANCELLED'
    ) {
      actions.push({
        key: 'reopen',
        label: 'Reopen',
        variant: 'warning',
        needsModal: true,
        modalTitle: 'Reopen Claim',
        modalLabel: 'Reason for reopening',
        modalConfirmLabel: 'Reopen',
      });
    }
    if (s !== 'CANCELLED' && s !== 'PAID') {
      actions.push({
        key: 'cancel',
        label: 'Cancel Claim',
        variant: 'danger',
        needsModal: true,
        modalTitle: 'Cancel Claim',
        modalLabel: 'Reason for cancellation',
        modalConfirmLabel: 'Cancel Claim',
      });
    }
  }

  return actions;
}

const VARIANT_STYLES: Record<string, string> = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500',
  success: 'bg-green-600 hover:bg-green-700 text-white focus:ring-green-500',
  danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
  warning: 'bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-500',
  secondary: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 focus:ring-gray-400',
};

// ─── Info row ──────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-800">{value ?? '—'}</dd>
    </div>
  );
}

// ─── Not found ─────────────────────────────────────────────────────────────

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 gap-4">
      <div className="text-gray-300">
        <svg className="w-16 h-16" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2a4 4 0 014-4h0a4 4 0 014 4v2M9 7a4 4 0 118 0A4 4 0 019 7z" />
        </svg>
      </div>
      <p className="text-lg font-semibold text-gray-600">Claim not found</p>
      <button
        type="button"
        onClick={onBack}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
      >
        Go Back
      </button>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

const ClaimDetail: React.FC<ClaimDetailProps> = ({ currentUser }) => {
  const { claimId } = useParams<{ claimId: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [activeModal, setActiveModal] = useState<ActionConfig | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [checkedAdvances, setCheckedAdvances] = useState<Set<string>>(new Set());
  const [liveAdvances, setLiveAdvances] = useState<ClaimAdvanceItem[]>([]);
  const [advancesLoading, setAdvancesLoading] = useState(false);
  const [advancesError, setAdvancesError] = useState('');

  // ── Claim Summary Details state ───────────────────────────────────────────
  const [claimLineItems, setClaimLineItems] = useState<ClaimLineItem[]>([]);
  const [summaryLeaves, setSummaryLeaves] = useState<ParsedLeave[]>([]);
  const [summaryLeavesLoading, setSummaryLeavesLoading] = useState(false);
  const [summaryAssignments, setSummaryAssignments] = useState<ParsedAssignment[]>([]);
  const [allNearbyAssignments, setAllNearbyAssignments] = useState<ParsedAssignment[]>([]); // full ±30-day window for DA adjacent-assignment logic
  const [summaryAssignmentsLoading, setSummaryAssignmentsLoading] = useState(false);
  const [summaryFlights, setSummaryFlights] = useState<Record<string, unknown>[]>([]);
  const [summaryFlightsLoading, setSummaryFlightsLoading] = useState(false);
  // Trainer email resolved from PMS — used for all HR action notifications
  const [resolvedTrainerEmail, setResolvedTrainerEmail] = useState<string>('');
  const [summaryAccom, setSummaryAccom] = useState<Record<string, unknown>[]>([]);
  const [summaryAccomLoading, setSummaryAccomLoading] = useState(false);
  // Live FX rates from XE-equivalent API (open.er-api.com)
  const { rates: liveRates } = useLiveRates();
  // Once a claim is Paid, its DA/Travel/Misc breakup must never change again just because
  // today's XE rate differs from the rate used when it was actually approved/paid — HR
  // reopening a Paid bill from Payment Processing must see the exact same numbers every time.
  // fxRatesSnapshot is captured at Approve/Partial-Approve time (see persistAction) precisely so
  // a Paid claim can keep using the rate that was actually in effect, instead of today's live one.
  // `claim` isn't declared until further down this component — computed lazily inside toINR
  // (called only later in render, well after `claim` exists) rather than eagerly here, to avoid
  // a temporal-dead-zone reference.
  const toINR = (amount: number, currency: string) => {
    const snapshot = (claim as unknown as { fxRatesSnapshot?: Record<string, number> } | undefined)?.fxRatesSnapshot;
    const effectiveRates = (claim?.status === 'Paid' && snapshot) ? snapshot : liveRates;
    return convertToINR(amount, currency, effectiveRates);
  };

  // A Paid claim that predates fxRatesSnapshot being captured at Approve time has no frozen
  // rate to fall back to — toINR falls through to live rates for it, so every HR correction
  // made on it (DA/TA/Misc edit, Already Paid deduction) keeps recomputing the FX portion at
  // TODAY's rate instead of the rate in effect when the bill was actually approved. The true
  // approval-time rate is unrecoverable for these legacy claims, but we can stop the ongoing
  // drift going forward: the moment HR touches such a claim, capture the current rate as its
  // permanent snapshot right alongside the edit, so every later view/edit of THIS claim reuses
  // that same frozen rate instead of re-reading live rates again. A claim that already has a
  // snapshot (the normal case since fxRatesSnapshot shipped) is left untouched here.
  const ensureFxSnapshot = (base: import('../types').ClaimHeader) =>
    (base.status === 'Paid' && !base.fxRatesSnapshot) ? { fxRatesSnapshot: liveRates } : {};

  // HR Admin DA override state — keyed by DATE (not row index, which shifts across reloads
  // as PMS data changes) and persisted to the claim record so an edit survives navigation/
  // reload and shows identically in Payment Processing, Verification Queue, or any other
  // view of this same claim, instead of being silently discarded by the live PMS recompute.
  const [daHrOverrides, setDaHrOverrides] = useState<Record<string, { country: string; currency: string; amount: number }>>({});
  const [daEditIdx, setDaEditIdx] = useState<number | null>(null);
  const [daEditValues, setDaEditValues] = useState<{ country: string; currency: string; amount: number }>({ country: '', currency: 'USD', amount: 0 });

  // HR Admin Travel/Cab override state — keyed by lineItemId, persisted to the claim record
  const [taHrOverrides, setTaHrOverrides] = useState<Record<string, { currency: string; amount: number }>>({});
  const [taEditIdx, setTaEditIdx] = useState<number | null>(null);
  const [taEditValues, setTaEditValues] = useState<{ currency: string; amount: number }>({ currency: 'INR', amount: 0 });

  // HR Admin Misc override state — keyed by lineItemId, persisted to the claim record
  const [miscHrOverrides, setMiscHrOverrides] = useState<Record<string, { currency: string; amount: number }>>({});
  const [miscEditIdx, setMiscEditIdx] = useState<number | null>(null);
  const [miscEditValues, setMiscEditValues] = useState<{ currency: string; amount: number }>({ currency: 'INR', amount: 0 });

  // Set the moment HR saves ANY DA/TA/Misc row edit on THIS page view (see
  // persistHrOverrideField below) — lets showLiveAmounts re-enable the live recompute display
  // for a claim HR is actively correcting even while its status is still 'Paid' (editing a row
  // doesn't require clicking Reopen first, and doesn't change `status` either), instead of
  // hiding the very correction HR just made. Deliberately session-scoped, not derived from
  // "daHrOverrides/etc. is non-empty" — a Paid claim commonly already has overrides baked into
  // its approval history, which must stay frozen until HR touches something THIS visit.
  const [paidClaimEditedThisSession, setPaidClaimEditedThisSession] = useState(false);

  // Already-Paid-for-this-assignment adjustment — HR reopening an already-Paid bill (e.g. to
  // correct a mistake) needs to see, and deduct, whatever was already disbursed against the
  // SAME assignment ID under other claims, so re-approving doesn't pay the trainer twice for
  // the same work. Editable (HR can override the auto-detected total) and persisted to the
  // claim record like the other HR override fields above.
  // Live-follows whatever HR actually types here — Amount Summary, the Net Payable banner, the
  // header, and the Live Final Summary strip all reflect this value immediately as it's edited.
  // No auto-fill: it starts at 0 unless a value was previously saved for this claim. "Apply
  // Deduction" persists the current value to the claim record (so it survives reload and feeds
  // the actual Approve-time calculation) — it is not a gate on the live on-screen totals.
  const [alreadyPaidDeduction, setAlreadyPaidDeduction] = useState<number>(0);
  const [alreadyPaidDeductionSavedValue, setAlreadyPaidDeductionSavedValue] = useState<number | null>(null);

  const [receiptPreview, setReceiptPreview] = useState<{ url: string; name: string } | null>(null);
  const [routeModal, setRouteModal] = useState<{ from: string; to: string } | null>(null);

  // Post-submission misc expense upload — exempted trainers (and HR Admin on their behalf)
  // can add NEW misc expense bills to an already-submitted claim, not just view/edit existing
  // ones. Add employee codes here (without "EMP-" prefix) as needed.
  const MISC_POST_SUBMIT_EXEMPT_EMP_CODES = new Set(['2485']); // Ankur Kumar
  const [miscPostSubmitDraft, setMiscPostSubmitDraft] = useState<{
    date: string; expenseType: string; amount: number; currency: string; remarks: string;
    receiptData: string; receiptName: string;
  }>({ date: '', expenseType: 'Other', amount: 0, currency: 'INR', remarks: '', receiptData: '', receiptName: '' });
  const [miscPostSubmitSaving, setMiscPostSubmitSaving] = useState(false);
  const [miscPostSubmitMsg, setMiscPostSubmitMsg] = useState('');

  // Payment record for this claim. Used to be localStorage-only — invisible whenever this
  // claim is opened from a different browser/device than the one that recorded the payment
  // (exactly the "earlier paid amount is not showing" report). Fetch the server-side copy
  // (Turso) and prefer it; fall back to the local cache only if that fetch hasn't landed yet.
  type PaymentRecordShape = {
    paymentId: string; claimId: string; billNumber: string; trainerName: string;
    paidAmount: number; paymentDate: string; utrReference: string; paymentMode: string;
    financeRemarks: string; processedBy: string; processedAt: string;
  };
  // Full payment HISTORY, not just one record — a bill can legitimately be paid more than
  // once against the same claimId (e.g. an initial payment, then HR reopens/edits the claim
  // to correct the approved amount and a further payment is recorded for the difference).
  // Every past entry must stay visible; a later payment must never appear to erase an earlier
  // one. Sorted newest first; `paymentRecord` (singular, kept for existing callers) is just the
  // most recent entry.
  const [tursoPaymentRecords, setTursoPaymentRecords] = useState<PaymentRecordShape[]>([]);
  useEffect(() => {
    if (!claimId) return;
    fetch(`/api/turso?type=payments&claimId=${encodeURIComponent(claimId)}`)
      .then(r => r.ok ? r.json() : { payments: [] })
      .then((d: { payments?: PaymentRecordShape[] }) => {
        if (Array.isArray(d.payments)) setTursoPaymentRecords(d.payments);
      })
      .catch(() => {});
  }, [claimId]);
  const paymentRecords = useMemo(() => {
    if (tursoPaymentRecords.length > 0) return tursoPaymentRecords;
    const all = getFromStorage<PaymentRecordShape[]>('tada_local_payments', []);
    return all.filter(p => p.claimId === claimId).sort((a, b) => (b.processedAt || '').localeCompare(a.processedAt || ''));
  }, [claimId, tursoPaymentRecords]);
  const paymentRecord = paymentRecords[0] ?? null;

  const [summaryOpen, setSummaryOpen] = useState<Record<string, boolean>>({
    assignment: true, leaves: false, da: false, flights: false, lodging: false, travel: true, misc: true,
  });

  const [claimRefreshTick, setClaimRefreshTick] = useState(0);
  useEffect(() => {
    refreshClaims().then(() => setClaimRefreshTick(n => n + 1));
  }, [claimId]);

  const claim = useMemo(() => {
    const realClaim = getClaims().find((c) => c.claimId === claimId);
    if (realClaim) return realClaim as unknown as (typeof mockClaims)[number];
    return mockClaims.find((c) => c.claimId === claimId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimId, claimRefreshTick]);

  // Restore any previously-saved HR overrides for THIS claim once it loads — keyed only on
  // claimId (not claimRefreshTick) so an in-progress local edit isn't clobbered by a
  // background poll refresh of the same claim.
  useEffect(() => {
    const savedDa = (claim as unknown as { daHrOverrides?: Record<string, { country: string; currency: string; amount: number }> })?.daHrOverrides;
    if (savedDa) setDaHrOverrides(savedDa);
    const savedTa = (claim as unknown as { taHrOverrides?: Record<string, { currency: string; amount: number }> })?.taHrOverrides;
    if (savedTa) setTaHrOverrides(savedTa);
    const savedMisc = (claim as unknown as { miscHrOverrides?: Record<string, { currency: string; amount: number }> })?.miscHrOverrides;
    if (savedMisc) setMiscHrOverrides(savedMisc);
    const savedAlreadyPaid = (claim as unknown as { alreadyPaidDeduction?: number })?.alreadyPaidDeduction;
    if (savedAlreadyPaid != null) { setAlreadyPaidDeduction(savedAlreadyPaid); setAlreadyPaidDeductionSavedValue(savedAlreadyPaid); }
    // A claim can already carry HR overrides from a PAST session (e.g. corrected after it was
    // Paid, without a follow-up Approve to reconcile the stored approvedAmount/netPayable) —
    // paidClaimEditedThisSession is otherwise session-scoped and would stay false on a fresh
    // page load, hiding an already-saved correction behind the frozen historical total. If any
    // override was actually restored just above, treat this claim as "touched" from the start.
    // Bug fixed 2026-09-08: TADA-2026-00054 — HR had zeroed/reduced two Cab bills (taHrOverrides
    // persisted), but Amount Summary kept showing the original pre-correction ₹44,926 on every
    // subsequent reopen because nothing in THIS session had "just" made the edit.
    if ((savedDa && Object.keys(savedDa).length > 0) ||
        (savedTa && Object.keys(savedTa).length > 0) ||
        (savedMisc && Object.keys(savedMisc).length > 0)) {
      setPaidClaimEditedThisSession(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimId]);

  // Other claims for this SAME trainer, on the SAME assignment ID(s), that are already Paid —
  // this is the money HR must not pay again when reopening/re-approving this claim.
  const assignmentAlreadyPaidClaims = useMemo(() => {
    if (!claim) return [] as import('../types').ClaimHeader[];
    const thisAsgnIds = new Set(((claim as unknown as { assignmentIds?: string[] }).assignmentIds ?? []).map(String));
    if (thisAsgnIds.size === 0) return [];
    return getClaims().filter(c =>
      c.claimId !== claimId &&
      c.trainerId === (claim as unknown as { trainerId?: string }).trainerId &&
      // paymentStatus survives a Reopen (which only changes `status`) — a claim that WAS paid
      // and got reopened for correction is still money already disbursed, not un-paid. Checking
      // status alone hid this exact panel for a reopened-but-paid sibling claim. Bug fixed
      // 2026-08-24: Akshay Kumar EMP-519, Asgn #265769 — TADA-2026-00030 (paid, then reopened)
      // no longer triggered the "Already Paid" panel on TADA-2026-00006.
      (c.status === 'Paid' || (c as unknown as { paymentStatus?: string }).paymentStatus === 'Paid') &&
      (c.assignmentIds ?? []).some(aid => thisAsgnIds.has(String(aid)))
    );
  }, [claim, claimId, claimRefreshTick]);

  const assignmentAlreadyPaidTotal = useMemo(
    () => assignmentAlreadyPaidClaims.reduce((s, c) => s + (c.netPayable ?? c.totalClaimedAmount ?? 0), 0),
    [assignmentAlreadyPaidClaims]
  );

  // HR types the deduction amount themselves — the input starts at 0 (or whatever was
  // previously saved for this claim) and is never silently pre-filled with the auto-detected
  // total. The total is still shown alongside the input as a reference figure only.

  const [alreadyPaidDeductionSaving, setAlreadyPaidDeductionSaving] = useState(false);
  const applyAlreadyPaidDeduction = async (value: number) => {
    if (!claimId) return;
    const base = getClaims().find((c) => c.claimId === claimId);
    if (!base) {
      window.alert('Could not apply the deduction — claim record not found. Please reload the page and try again.');
      return;
    }
    setAlreadyPaidDeduction(value);
    setAlreadyPaidDeductionSaving(true);
    // HR is actively adjusting this claim — see paidClaimEditedThisSession above.
    setPaidClaimEditedThisSession(true);
    try {
      // Awaited (unlike the fire-and-forget saveClaim used for cosmetic overrides elsewhere) —
      // this deduction directly affects what gets paid, so HR needs a real confirmation the
      // server write succeeded, not just an optimistic UI update. Previously this used the
      // fire-and-forget saveClaim with no visible feedback at all, which made the button look
      // broken even when it silently worked.
      //
      // Also refresh the STORED netPayable/approvedAmount to the current live-computed figure
      // right now, not just the raw alreadyPaidDeduction number. Payment Processing and the
      // Koenig export can't re-run the live PMS/DA-overlap calculation themselves — they trust
      // whatever netPayable was stored at the last Approve action. If the live DA-overlap dedup
      // logic corrects itself (or the count of already-paid days changes) AFTER that Approve
      // click, the stored figure goes stale and those other screens keep showing an outdated
      // number until HR happens to re-Approve. Bug fixed 2026-08-26: Mayur Bhushan Kotoky
      // TADA-2026-00082 — Payment Processing showed a ₹2,511 recovery from a stale stored
      // netPayable of -2,511, while the live-recomputed figure (with the 6 already-paid days
      // correctly excluded from the DA total) was actually a positive ₹6,421, no recovery at all.
      const correctedTotal = liveDataReady ? liveGrandTotalINR : (base.totalClaimedAmount ?? 0);
      const correctedNet = correctedTotal - (base.advanceAdjusted ?? 0) - (base.deductionAmount ?? 0) - value;
      await saveClaimAsync({
        ...base,
        alreadyPaidDeduction: value,
        approvedAmount: correctedTotal,
        netPayable: correctedNet,
        ...ensureFxSnapshot(base),
      } as import('../types').ClaimHeader);
      setAlreadyPaidDeductionSavedValue(value);
    } catch {
      window.alert('Failed to save the deduction to the server. Please check your connection and try again.');
    } finally {
      setAlreadyPaidDeductionSaving(false);
    }
  };

  // Persist an HR override field immediately to the claim record — so it survives navigation/
  // reload and appears identically in Payment Processing, Verification Queue, or any other
  // view of this claim, without waiting for a full Approve/Reject action.
  const persistHrOverrideField = (
    field: 'daHrOverrides' | 'taHrOverrides' | 'miscHrOverrides',
    value: Record<string, unknown>,
  ) => {
    if (!claimId) return;
    const base = getClaims().find((c) => c.claimId === claimId);
    if (!base) return;
    saveClaim({ ...base, [field]: value, ...ensureFxSnapshot(base) } as import('../types').ClaimHeader);
    // HR just adjusted a row on this claim — see paidClaimEditedThisSession above.
    setPaidClaimEditedThisSession(true);
  };

  // Whether the current user can add a NEW misc expense to this already-submitted claim.
  // HR Admin/SuperAdmin can ALWAYS do this, for any trainer's claim, on that trainer's
  // behalf — a general capability. Direct self-service from the Trainer's own login is
  // restricted to specific exempted employee codes (see MISC_POST_SUBMIT_EXEMPT_EMP_CODES) —
  // e.g. Ankur Kumar EMP-2485 — not a general trainer capability.
  const claimTrainerEmpCode = String((claim as unknown as { trainerId?: string })?.trainerId ?? '').replace(/^EMP-/i, '').trim();
  const canAddMiscPostSubmit =
    currentUser.role === 'HRAdmin' || currentUser.role === 'SuperAdmin' ||
    (currentUser.role === 'Trainer' && MISC_POST_SUBMIT_EXEMPT_EMP_CODES.has(claimTrainerEmpCode));

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Downscale + re-encode image receipts (like CreateTADABill's compressAndEncode) so a
  // full-resolution phone photo (often 3-8MB) doesn't blow past the API's body size limit
  // and silently fail the POST. Non-images (PDFs) pass through unchanged.
  function compressReceiptForPostSubmit(file: File): Promise<string> {
    if (!file.type.startsWith('image/')) return fileToBase64(file);
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
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

  async function addMiscExpensePostSubmit() {
    if (!claimId || !miscPostSubmitDraft.date || !miscPostSubmitDraft.amount) return;
    setMiscPostSubmitSaving(true);
    setMiscPostSubmitMsg('');
    try {
      const lineItemId = `LI-OTHER-${claimId}-${Date.now()}`;

      // Upload the receipt to Vercel Blob first (real bytes, correct content-type) and store
      // only the small URL in Turso — same reason as CreateTADABill.tsx's submit flow: sending
      // raw base64 in the line-items row bloats Turso storage and Vercel bandwidth, and risks
      // hitting request-size limits. Falls back to the base64 itself if the upload fails.
      let receiptData = miscPostSubmitDraft.receiptData || undefined;
      if (receiptData && receiptData.startsWith('data:')) {
        try {
          const contentType = receiptData.match(/^data:([^;]+);/)?.[1] ?? 'application/octet-stream';
          const ur = await fetch('/api/turso?type=upload-receipt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64: receiptData, filename: miscPostSubmitDraft.receiptName || lineItemId, contentType }),
          });
          if (ur.ok) {
            const { url } = await ur.json() as { url?: string };
            if (url) receiptData = url;
          }
        } catch { /* keep base64 as fallback */ }
      }

      const newItem: import('../types').ClaimLineItem = {
        lineItemId,
        claimId,
        expenseType: 'Other',
        expenseSubType: miscPostSubmitDraft.expenseType,
        date: miscPostSubmitDraft.date,
        description: `${miscPostSubmitDraft.expenseType}: ${miscPostSubmitDraft.remarks}`,
        claimedAmount: miscPostSubmitDraft.amount,
        policyLimit: miscPostSubmitDraft.amount,
        eligibleAmount: miscPostSubmitDraft.amount,
        approvedAmount: 0,
        deductionAmount: 0,
        currency: miscPostSubmitDraft.currency,
        receiptRequired: true,
        receiptUploaded: !!receiptData,
        exceptionRequired: false,
        receiptData,
        receiptUrl: receiptData?.startsWith('http') ? receiptData : undefined,
        receiptFileName: miscPostSubmitDraft.receiptName || undefined,
      } as import('../types').ClaimLineItem;

      const r = await fetch('/api/turso?type=lineitems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItems: [newItem] }),
      });
      if (!r.ok) {
        const bodyText = await r.text().catch(() => '');
        console.error('[addMiscExpensePostSubmit] POST failed', r.status, bodyText);
        throw new Error(`HTTP ${r.status}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ''}`);
      }

      setClaimLineItems(prev => [...prev, newItem]);

      // Persist the addition into the claim's own stored totals immediately — the header
      // strip and My Bills list both read totalClaimedAmount/netPayable directly (no live
      // recompute), so without this the new expense would never show up there at all.
      if (claim) {
        const addedInr = toINR(newItem.claimedAmount, newItem.currency ?? 'INR');
        const newTotal = (claim.totalClaimedAmount ?? 0) + addedInr;
        const newNet = newTotal - (claim.advanceAdjusted ?? 0) - (claim.deductionAmount ?? 0) - (claim.recoverableAmount ?? 0);
        saveClaim({ ...claim, totalClaimedAmount: newTotal, netPayable: newNet } as import('../types').ClaimHeader);
        setClaimRefreshTick(n => n + 1);
      }

      setMiscPostSubmitDraft({ date: '', expenseType: 'Other', amount: 0, currency: 'INR', remarks: '', receiptData: '', receiptName: '' });
      setMiscPostSubmitMsg('✅ Expense added');
    } catch (err) {
      console.error('[addMiscExpensePostSubmit] failed', err);
      setMiscPostSubmitMsg(`❌ Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setMiscPostSubmitSaving(false);
      setTimeout(() => setMiscPostSubmitMsg(''), 5000);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function addDays(iso: string, n: number): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // ── Live API fetch: all advances for this trainer within 30 days of claim period
  const fetchLiveAdvances = useCallback(async () => {
    if (!claim) return;
    const empCode = String((claim as unknown as { trainerId?: string }).trainerId ?? '').replace(/^EMP-/i, '').trim();
    if (!empCode) return;
    setAdvancesLoading(true);
    setAdvancesError('');
    try {
      const res = await fetch(`/api/advances?empCode=${encodeURIComponent(empCode)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rawList: Record<string, unknown>[] = Array.isArray(data.advances) ? data.advances : [];

      const claimStart = (claim as unknown as { claimStartDate?: string }).claimStartDate ?? '';
      const claimEnd   = (claim as unknown as { claimEndDate?: string }).claimEndDate   ?? '';
      const windowStart = addDays(claimStart, -30);
      const windowEnd   = addDays(claimEnd, 30);

      const filtered = rawList.filter(r => {
        const amount = Number(r.Amount ?? 0);
        if (amount <= 0) return false;
        const d = parseDT(String(r.Date ?? ''));
        if (!d) return false;
        return d >= windowStart && d <= windowEnd;
      });

      const rawItems = filtered.map(r => ({
        key:       String(r.TABillID && r.TABillID !== '0' ? `BILL-${r.TABillID}` : `${r.Date}-${r.Amount}`),
        date:      parseDT(String(r.Date ?? '')) || claimStart,
        amount:    Number(r.Amount ?? 0),
        currency:  String(r.Currency ?? 'INR').toUpperCase(),
        type:      String(r.Type ?? ''),
        taBillId:  r.TABillID && r.TABillID !== '0' ? `BILL-${r.TABillID}` : '',
        narration: String(r.Narration ?? ''),
        source:    'pms' as const,
      }));

      // Show remaining advance balance: original minus what was already recovered
      // in previously approved claims. Fully recovered advances are hidden.
      // For any advance THIS claim itself already recorded a recovery against (e.g. on a
      // prior Approve, now Reopened for re-review), show its own recorded originalAmount
      // directly — in the advance's REAL currency (e.g. AED) — instead of the globally
      // "remaining" balance. claimAmountUsed is an INR-converted claim-currency figure, not
      // the advance's own amount, so adding it back would mix units (bug fixed 2026-08-12,
      // second pass: showed "AED 14,499" instead of "AED 450" for Gajendra Chaudhary).
      const ownRecoveries = (claim as unknown as { advanceRecoveries?: { advanceKey: string; claimAmountUsed: number; originalAmount?: number }[] })?.advanceRecoveries ?? [];
      const ownRecoveryByKey = new Map(ownRecoveries.map(r => [r.advanceKey, r]));
      const visibleItems = rawItems.reduce<typeof rawItems>((acc, item) => {
        const ownRec = ownRecoveryByKey.get(item.key);
        if (ownRec) {
          // Prefer the recorded original amount (accurate, real currency); fall back to the
          // raw PMS amount for older recoveries recorded before originalAmount was stored.
          acc.push({ ...item, amount: ownRec.originalAmount ?? item.amount });
          return acc;
        }
        const remaining = getAdvanceRemaining(empCode, item.key, item.amount);
        if (remaining > 0) acc.push({ ...item, amount: remaining });
        return acc;
      }, []);

      setLiveAdvances(visibleItems);
      // Auto-tick any advance this claim already recorded a recovery against — HR Admin
      // already took that action; re-showing it unchecked would look like it was never done.
      setCheckedAdvances(new Set(visibleItems.filter(i => ownRecoveryByKey.has(i.key)).map(i => i.key)));
    } catch (err) {
      setAdvancesError(err instanceof Error ? err.message : 'Failed to load advances');
    } finally {
      setAdvancesLoading(false);
    }
  }, [claim]);

  useEffect(() => {
    fetchLiveAdvances();
  }, [fetchLiveAdvances]);

  // ── Load line items: always MERGE, never overwrite ───────────────────────────
  // Three sources: embedded claim JSON, localStorage cache, Turso line_items table.
  // All three are merged by lineItemId so no source can erase another's items.
  // Turso wins for same lineItemId (has receiptData); items only in embedded/local
  // are preserved even if Turso doesn't have them yet (older submissions).
  // IMPORTANT: never do a plain setClaimLineItems(newArray) — always use functional
  // update so that whichever source resolves last cannot wipe out items from others.
  useEffect(() => {
    if (!claimId) return;

    const merge = (prev: ClaimLineItem[], incoming: ClaimLineItem[]): ClaimLineItem[] => {
      if (!incoming.length) return prev;
      const map = new Map(prev.map(li => [li.lineItemId, li]));
      incoming.forEach(li => {
        const ex = map.get(li.lineItemId);
        // Upgrade: take incoming if it has receiptData that existing lacks, or is simply new
        if (!ex || (!ex.receiptData && li.receiptData)) map.set(li.lineItemId, li);
        else if (!ex) map.set(li.lineItemId, li);
      });
      return Array.from(map.values());
    };

    // 1. Embedded claim JSON (fastest, no network)
    const embedded = (claim as unknown as { lineItems?: ClaimLineItem[] })?.lineItems;
    if (embedded && embedded.length > 0) {
      setClaimLineItems(prev => merge(prev, embedded));
    }

    // 2. localStorage / in-memory cache
    const local = getLineItems(claimId);
    if (local && local.length > 0) {
      setClaimLineItems(prev => merge(prev, local));
    }

    // 3. Turso line_items table — authoritative cross-device source.
    //    Turso wins for the same lineItemId (may have receiptData that embedded lacks).
    fetch(`/api/turso?type=lineitems&claimId=${encodeURIComponent(claimId)}`)
      .then(r => r.ok ? r.json() : { lineItems: [] })
      .then(d => {
        if (!Array.isArray(d.lineItems)) return;
        setClaimLineItems(prev => {
          const map = new Map(prev.map((li: ClaimLineItem) => [li.lineItemId, li]));
          // Turso wins for all fields except receiptData — if Turso stripped the
          // receipt (fallback due to payload size), keep the locally-cached version.
          d.lineItems.forEach((li: ClaimLineItem) => {
            const existing = map.get(li.lineItemId);
            map.set(li.lineItemId, {
              ...li,
              receiptData: li.receiptData || existing?.receiptData,
              receiptFileName: li.receiptFileName || existing?.receiptFileName,
            });
          });
          return Array.from(map.values());
        });
      })
      .catch(() => {});
  }, [claimId, claim]);

  // ── Resolve trainer email from PMS immediately on load (independent, fast) ──
  // Runs as soon as claim loads — before flights/accommodation fetch — so
  // resolvedTrainerEmail is ready when HR Admin clicks any action button.
  useEffect(() => {
    if (!claim) return;
    const trainerId = String((claim as unknown as { trainerId?: string }).trainerId ?? '');
    const empCode = trainerId.replace(/^EMP-/i, '').trim();
    if (!empCode) return;
    fetch(`/api/employee?empCode=${encodeURIComponent(empCode)}`)
      .then(r => r.ok ? r.json() : {})
      .then((d: Record<string, unknown>) => {
        const emp = ((d.employee ?? {}) as Record<string, unknown>);
        const email = String(emp.email_address ?? emp.EmailAddress ?? emp.Email ?? emp.email ?? '').trim();
        if (email) setResolvedTrainerEmail(email);
      })
      .catch(() => {});
  }, [claim]);

  // ── Fetch flights from PMS, filter to claim date range ───────────────────
  // Depends on resolvedTrainerEmail so it retries once the email is known —
  // API 108 (email-based) is more reliable than API 256 (empCode) for some trainers.
  useEffect(() => {
    if (!claim) return;
    const trainerId = String((claim as unknown as { trainerId?: string }).trainerId ?? '');
    const empCode   = trainerId.replace(/^EMP-/i, '').trim();
    // Need at least one of empCode or email to query
    if (!empCode && !resolvedTrainerEmail) return;

    setSummaryFlightsLoading(true);
    const params = new URLSearchParams();
    if (empCode)              params.set('empCode', empCode);
    if (resolvedTrainerEmail) params.set('email',   resolvedTrainerEmail);

    fetch(`/api/flights?${params}`)
      .then(r => r.json())
      .then(d => {
        const all: Record<string, unknown>[] = Array.isArray(d.flights) ? d.flights : [];

        // Build date window: ±14 days around claim dates to catch connecting flights
        const start = (claim as unknown as { claimStartDate?: string }).claimStartDate ??
                      (claim as unknown as { fromDate?: string }).fromDate ?? '';
        const end   = (claim as unknown as { claimEndDate?: string }).claimEndDate ??
                      (claim as unknown as { toDate?: string }).toDate ?? '';
        const shiftDays = (iso: string, days: number) => {
          const x = new Date(iso); x.setDate(x.getDate() + days); return x.toISOString().slice(0, 10);
        };
        const from14 = start ? shiftDays(start, -14) : '';
        const to14   = end   ? shiftDays(end,   +14) : '';

        const filtered = (from14 || to14)
          ? all.filter(f => {
              const dep = parseDT(String(f.departure_date ?? ''));
              if (!dep) return true; // keep if no date to avoid hiding flights
              if (from14 && dep < from14) return false;
              if (to14   && dep > to14)   return false;
              return true;
            })
          : all;

        setSummaryFlights(prev => {
          // Keep existing results if new fetch returned less (race condition guard)
          if (filtered.length === 0 && prev.length > 0) return prev;
          return filtered.sort((a, b) => {
            const da = parseDT(String(a.departure_date ?? ''));
            const db = parseDT(String(b.departure_date ?? ''));
            return da < db ? -1 : da > db ? 1 : 0;
          });
        });
      })
      .catch(() => {/* keep existing results on error */})
      .finally(() => setSummaryFlightsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim, resolvedTrainerEmail]);

  // ── Fetch accommodation from PMS, filter to claim date range ─────────────
  useEffect(() => {
    if (!claim) return;
    const trainerId = String((claim as unknown as { trainerId?: string }).trainerId ?? '');
    const empCode   = trainerId.replace(/^EMP-/i, '').trim();
    if (!empCode) return;
    setSummaryAccomLoading(true);
    fetch(`/api/accommodation?empCode=${encodeURIComponent(empCode)}`)
      .then(r => r.json())
      .then(d => {
        const all: Record<string, unknown>[] = Array.isArray(d.accommodation) ? d.accommodation : [];
        const start = (claim as unknown as { claimStartDate?: string }).claimStartDate ?? '';
        const end   = (claim as unknown as { claimEndDate?: string }).claimEndDate ?? '';
        // An accommodation stay overlaps the claim period when:
        //   checkIn  <= claimEnd + 5 days  (stay starts before or near claim end)
        //   checkOut >= claimStart - 5 days (stay ends after or near claim start)
        // This captures stays that began before the claim date range (common for
        // multi-day trips where hotel check-in is 2–4 days before the assignment).
        const addD5 = (iso: string, n: number) => { if (!iso) return ''; const x = new Date(iso); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
        const windowStart = start ? addD5(start, -5) : '';
        const windowEnd   = end   ? addD5(end,   5)  : '';
        const inRange = (start || end)
          ? all.filter(r => {
              const ci = parseDT(String(r.CheckInDate  ?? ''));
              const co = parseDT(String(r.CheckOutDate ?? ''));
              if (!ci) return false;
              // check-in must be before windowEnd; check-out (if known) must be after windowStart
              if (windowEnd   && ci > windowEnd)   return false;
              if (windowStart && co && co < windowStart) return false;
              return true;
            })
          : all;
        inRange.sort((a, b) => parseDT(String(a.CheckInDate ?? '')).localeCompare(parseDT(String(b.CheckInDate ?? ''))));
        setSummaryAccom(inRange);
      })
      .catch(() => setSummaryAccom([]))
      .finally(() => setSummaryAccomLoading(false));
  }, [claim]);

  // ── Fetch leave dates from PMS (all leaves for trainer, filter client-side) ───
  useEffect(() => {
    if (!claim) return;
    const empCode = String((claim as unknown as { trainerId?: string }).trainerId ?? '').replace(/^EMP-/i, '').trim();
    const start = (claim as unknown as { claimStartDate?: string }).claimStartDate ?? '';
    const end   = (claim as unknown as { claimEndDate?: string }).claimEndDate ?? '';
    if (!empCode) return;
    setSummaryLeavesLoading(true);
    fetch(`/api/leaves?empCode=${encodeURIComponent(empCode)}`)
      .then(r => r.json())
      .then(d => {
        let all: Record<string, unknown>[] = Array.isArray(d.leaves) ? d.leaves : [];
        // client-side date filter (same logic as Step 3)
        if (start || end) {
          all = all.filter(l => {
            const lFrom = String(l.from_date ?? l.From_Date ?? '').slice(0, 10);
            const lTo   = String(l.to_date   ?? l.To_Date   ?? '').slice(0, 10);
            if (start && lTo   && lTo   < start) return false;
            if (end   && lFrom && lFrom > end)   return false;
            return true;
          });
        }
        setSummaryLeaves(all.map(l => normalizeLeave(l)));
      })
      .catch(() => setSummaryLeaves([]))
      .finally(() => setSummaryLeavesLoading(false));
  }, [claim]);

  // ── Fetch assignments from PMS matching claim's assignmentIds ─────────────
  useEffect(() => {
    if (!claim) return;
    const empCode = String((claim as unknown as { trainerId?: string }).trainerId ?? '').replace(/^EMP-/i, '').trim();
    const start = (claim as unknown as { claimStartDate?: string }).claimStartDate ?? '';
    const end   = (claim as unknown as { claimEndDate?: string }).claimEndDate ?? '';
    const assignmentIds: string[] = (claim as unknown as { assignmentIds?: string[] }).assignmentIds ?? [];
    if (!empCode || !start || !end) return;
    setSummaryAssignmentsLoading(true);
    // Widen window by 30 days each side to capture assignments on edge dates
    const from30 = new Date(start); from30.setDate(from30.getDate() - 30);
    const to30   = new Date(end);   to30.setDate(to30.getDate() + 30);
    const fromStr = from30.toISOString().slice(0, 10);
    const toStr   = to30.toISOString().slice(0, 10);
    fetch(`/api/assignments?empCode=${encodeURIComponent(empCode)}&from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`)
      .then(r => r.json())
      .then(d => {
        const all: Record<string, unknown>[] = Array.isArray(d.assignments) ? d.assignments : [];
        // All nearby assignments in the ±30-day window — used for prevAsgn/nextAsgn DA logic
        setAllNearbyAssignments(all.map(a => mapRawToAssignment(a as Record<string, unknown>)));
        // Only the current claim's assignments — used for display
        const matched = assignmentIds.length > 0
          ? all.filter(a => assignmentIds.includes(String((a as Record<string,unknown>).AssignmentId ?? '')))
          : all;
        // API 208 (the date-range fallback used whenever the emp-code API 258 fails for a
        // trainer) carries no city/country fields at all, unlike 258. mapRawToAssignment then
        // has nothing to infer a country from and silently defaults to India — wrong whenever
        // the trainer was actually abroad. Bug fixed 2026-08-24: Prem Sharma EMP-1563, assignment
        // 264833 (Kuala Lumpur) showed as India because 258 was down for this trainer and the
        // 208 fallback payload has no location data. Since every item here already belongs to
        // THIS claim (matched by assignmentIds), the trainer's own submitted trainingLocation is
        // reliable ground truth to fall back on when the live PMS record has no city at all.
        const trainingLoc = (claim as unknown as { trainingLocation?: string }).trainingLocation ?? '';
        setSummaryAssignments(matched.map(a => {
          const parsed = mapRawToAssignment(a as Record<string, unknown>);
          if (!parsed.city && trainingLoc) {
            // parsed.country is never falsy here — mapRawToAssignment's inferCountry() already
            // defaults an empty city/country pair straight to the STRING 'India', which trips
            // `parsed.country || ...` since 'India' is truthy. That silently locked the country
            // to India even when trainingLoc clearly inferred an international one. Bug fixed
            // 2026-08-24: Vaibhav Gupta EMP-2361, Asgn #263197 (Vienna) — asgn.country stayed
            // 'India' instead of 'Austria' despite trainingLoc correctly resolving to Austria.
            const inferredFromLoc = inferCountryFromCity(trainingLoc);
            const country = (inferredFromLoc && inferredFromLoc !== 'India') ? inferredFromLoc : parsed.country;
            return { ...parsed, city: trainingLoc, country };
          }
          return parsed;
        }));
      })
      .catch(() => setSummaryAssignments([]))
      .finally(() => setSummaryAssignmentsLoading(false));
  }, [claim]);

  // ── Consecutive-assignment enrichment ────────────────────────────────────
  // When a trainer has back-to-back assignments at the same international destination
  // (e.g. Dubai batch 1 → Dubai batch 2) with no return flight in between,
  // the 2nd assignment may have no city/country in PMS data. Inherit from previous.
  const enrichedSummaryAssignments = useMemo<ParsedAssignment[]>(() => {
    if (summaryAssignments.length === 0) return summaryAssignments;
    const activeFlights = summaryFlights.filter(f => f.Is_cancelled !== 'Yes');
    const addD = (iso: string, n: number) => { if (!iso) return ''; const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    const parseDTLocal = (s: string | null | undefined): string => { if (!s) return ''; const d = new Date(s); return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10); };
    const sorted = summaryAssignments.slice().sort((a, b) => (a.startDate || '') < (b.startDate || '') ? -1 : 1);
    return sorted.map((asgn, idx) => {
      if (asgn.city && asgn.country && asgn.country !== 'India') return asgn;
      if (asgn.city && inferCountryFromCity(asgn.city) === 'India') return asgn;
      // City alone already gives a confident, non-India answer (e.g. PMS left `country` blank
      // but `city_of_training` is "Porto") — trust it and stop here, same as the "city-inferred
      // country wins" rule used everywhere else in this file. Without this check, an assignment
      // with a blank country field but a perfectly identifiable city was falling through to the
      // "borrow country from the previous international assignment" logic below and getting
      // overwritten with a WRONG country (or India) that had nothing to do with where the
      // trainer actually was. Bug fixed 2026-08-21: Courage Tafadzwa Magadu EMP-3705, Asgn
      // #261661 — city_of_training "Porto" (Portugal) with no PMS country field ended up
      // labeled India instead of Portugal.
      if (asgn.city && inferCountryFromCity(asgn.city)) return asgn;
      if (asgn.deliveryMode === 'Online') return asgn; // ILO = trainer at home (India), never enrich
      const isConfidentIntl = (a: typeof asgn) =>
        (!!a.country && a.country !== 'India') ||
        (!!a.city && !!inferCountryFromCity(a.city) && inferCountryFromCity(a.city) !== 'India');
      const resolvedCountryOf = (a: typeof asgn) =>
        (a.country && a.country !== 'India') ? a.country : inferCountryFromCity(a.city || '');
      const prevIntl = sorted.slice(0, idx)
        .filter(a => a.country && a.country !== 'India')
        .sort((a, b) => (b.endDate || '') > (a.endDate || '') ? 1 : -1)[0] ?? null;
      if (prevIntl?.endDate) {
        const curStart = asgn.startDate || addD(prevIntl.endDate, 1);
        const returnToIndia = activeFlights.find(f => {
          const fd = parseDTLocal(String(f.departure_date ?? ''));
          if (!fd || fd < prevIntl.endDate! || fd > addD(curStart, 1)) return false;
          const toC = inferCountryFromCity(String(f.to_city ?? '').trim());
          return toC === 'India';
        });
        if (!returnToIndia) {
          return {
            ...asgn,
            city: asgn.city || prevIntl.city || '',
            country: prevIntl.country,
            trainingDates: asgn.trainingDates || (asgn.startDate ? `${asgn.startDate} to ${asgn.endDate || asgn.startDate}` : null),
          };
        }
        return asgn;
      }
      // No usable PREVIOUS assignment — e.g. this is the very FIRST assignment chronologically.
      // Look FORWARD: does the trainer continue directly into a LATER international assignment
      // at the same destination, with no return-to-India flight in between? Covers a trainer
      // based OUTSIDE India whose very first overseas leg has no PMS city/country and no outbound
      // flight to infer from. Bug fixed 2026-09-03: Soumik Das Purkayastha EMP-3639 (based in
      // Paris, France) — Asgn #254663 (20-24 Jul, London) had no city/country from PMS and no
      // outbound flight on file, silently defaulting to India.
      const nextIntl = sorted.slice(idx + 1)
        .filter(isConfidentIntl)
        .sort((a, b) => (a.startDate || '') < (b.startDate || '') ? -1 : 1)[0] ?? null;
      if (!nextIntl?.startDate) return asgn;
      const curEnd = asgn.endDate || asgn.startDate;
      if (!curEnd) return asgn;
      const returnToIndiaBefore = activeFlights.find(f => {
        const fd = parseDTLocal(String(f.departure_date ?? ''));
        if (!fd || fd < curEnd || fd > nextIntl.startDate!) return false;
        const toC = inferCountryFromCity(String(f.to_city ?? '').trim());
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
  }, [summaryAssignments, summaryFlights]);

  // ── Enriched nearby assignments — same two-pass logic applied to the full ±30-day window ──
  // Needed so prevAsgn/nextAsgn country checks in correctedDaItems see the correct international country.
  const enrichedNearbyAssignments = useMemo<ParsedAssignment[]>(() => {
    if (allNearbyAssignments.length === 0) return allNearbyAssignments;
    const activeFlights = summaryFlights.filter(f => f.Is_cancelled !== 'Yes');
    const addD = (iso: string, n: number) => { if (!iso) return ''; const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    const parseDTLocal = (s: string | null | undefined): string => { if (!s) return ''; const d = new Date(s); return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10); };
    // Pass 1: flight-based city/country enrichment (offline/field assignments only — ILO stays India)
    const flight1Pass = allNearbyAssignments.map(asgn => {
      if (asgn.city && asgn.country && asgn.country !== 'India') return asgn;
      if (asgn.city && inferCountryFromCity(asgn.city) === 'India') return asgn;
      if (asgn.deliveryMode === 'Online') return asgn; // ILO = trainer at home (India), never enrich
      const start = asgn.startDate || '';
      const outFlight = activeFlights.find(f => {
        const fd = parseDTLocal(String(f.departure_date ?? ''));
        return fd ? fd >= addD(start, -2) && fd <= addD(start, 2) : false;
      });
      const toCity = outFlight ? String(outFlight.to_city ?? '').trim() : '';
      const inferred = toCity ? inferCountryFromCity(toCity) : '';
      if (!inferred || inferred === 'India') return asgn;
      return { ...asgn, city: asgn.city || toCity, country: (asgn.country === 'India' || !asgn.country) ? inferred : asgn.country };
    });
    // Pass 2: consecutive-assignment enrichment (offline assignments only — ILO stays India)
    const sorted = flight1Pass.slice().sort((a, b) => (a.startDate || '') < (b.startDate || '') ? -1 : 1);
    return sorted.map((asgn, idx) => {
      if (asgn.city && asgn.country && asgn.country !== 'India') return asgn;
      if (asgn.city && inferCountryFromCity(asgn.city) === 'India') return asgn;
      // Same fix as enrichedSummaryAssignments above: a city that confidently maps to a real,
      // non-India country (exact or fuzzy match, NOT the "unrecognized city" default — that
      // default IS 'India' and is already excluded by the check just above) must win over
      // borrowing a country from an unrelated previous assignment.
      if (asgn.city && inferCountryFromCity(asgn.city)) return asgn;
      if (asgn.deliveryMode === 'Online') return asgn; // ILO = trainer at home (India), never enrich
      const isConfidentIntl2 = (a: typeof asgn) =>
        (!!a.country && a.country !== 'India') ||
        (!!a.city && !!inferCountryFromCity(a.city) && inferCountryFromCity(a.city) !== 'India');
      const resolvedCountryOf2 = (a: typeof asgn) =>
        (a.country && a.country !== 'India') ? a.country : inferCountryFromCity(a.city || '');
      const prevIntl = sorted.slice(0, idx)
        .filter(a => a.country && a.country !== 'India')
        .sort((a, b) => (b.endDate || '') > (a.endDate || '') ? 1 : -1)[0] ?? null;
      if (prevIntl?.endDate) {
        const curStart = asgn.startDate || addD(prevIntl.endDate, 1);
        const returnToIndia = activeFlights.find(f => {
          const fd = parseDTLocal(String(f.departure_date ?? ''));
          if (!fd || fd < prevIntl.endDate! || fd > addD(curStart, 1)) return false;
          const toC = inferCountryFromCity(String(f.to_city ?? '').trim());
          return toC === 'India';
        });
        if (!returnToIndia) {
          return {
            ...asgn,
            city: asgn.city || prevIntl.city || '',
            country: prevIntl.country,
            trainingDates: asgn.trainingDates || (asgn.startDate ? `${asgn.startDate} to ${asgn.endDate || asgn.startDate}` : null),
          };
        }
        return asgn;
      }
      // Same forward-look fallback as enrichedSummaryAssignments above (see that block's comment
      // for the full Soumik Das Purkayastha EMP-3639 explanation).
      const nextIntl2 = sorted.slice(idx + 1)
        .filter(isConfidentIntl2)
        .sort((a, b) => (a.startDate || '') < (b.startDate || '') ? -1 : 1)[0] ?? null;
      if (!nextIntl2?.startDate) return asgn;
      const curEnd2 = asgn.endDate || asgn.startDate;
      if (!curEnd2) return asgn;
      const returnToIndiaBefore2 = activeFlights.find(f => {
        const fd = parseDTLocal(String(f.departure_date ?? ''));
        if (!fd || fd < curEnd2 || fd > nextIntl2.startDate!) return false;
        const toC = inferCountryFromCity(String(f.to_city ?? '').trim());
        return toC === 'India';
      });
      if (returnToIndiaBefore2) return asgn;
      return {
        ...asgn,
        city: asgn.city || nextIntl2.city || '',
        country: resolvedCountryOf2(nextIntl2),
        trainingDates: asgn.trainingDates || (asgn.startDate ? `${asgn.startDate} to ${asgn.endDate || asgn.startDate}` : null),
      };
    });
  }, [allNearbyAssignments, summaryFlights]);

  // Raw live value from whichever advance checkboxes are CURRENTLY ticked this session.
  const liveCheckedAdvanceINR = useMemo(
    () => liveAdvances.filter(i => checkedAdvances.has(i.key)).reduce((s, i) => s + toINR(i.amount, i.currency), 0),
    [liveAdvances, checkedAdvances, liveRates]
  );
  // The advance list is refetched (and checkedAdvances reset to empty) on every page load —
  // including right after Reopen — so an unchecked session must NOT be read as "no advance".
  // Fall back to the claim's already-recorded advanceAdjusted until HR actively ticks a box
  // in THIS session to change it. Bug fixed 2026-08-12: TADA-2026-14919 (Yogesh Meherwade)
  // showed full claimed amount as Net Payable after Reopen instead of the recorded
  // Recoverable amount from its two previously-adjusted advances (₹72,500 + ₹55,000).
  const advanceAdjusted = checkedAdvances.size > 0 ? liveCheckedAdvanceINR : (claim?.advanceAdjusted ?? 0);

  // Net Payable = Total Claimed - Advance Adjusted
  // Positive → payable to employee; Negative → recoverable from employee
  const computedFinalSettlement = useMemo(() => {
    if (!claim) return 0;
    const base = claim.approvedAmount && claim.approvedAmount > 0
      ? claim.approvedAmount
      : claim.totalClaimedAmount ?? 0;
    const deductions = claim.deductionAmount ?? 0;
    const recoverable = claim.recoverableAmount ?? 0;
    return base - advanceAdjusted - deductions - recoverable;
  }, [claim, advanceAdjusted]);

  // ── DA correction — mirrors full daRows logic from CreateTADABill, including departure/return travel days ──
  const correctedDaItems = useMemo(() => {
    // `claim` is genuinely undefined for one render pass whenever this page is opened directly
    // on a claim that isn't in the local cache yet (e.g. a bill just submitted by the trainer,
    // before the refreshClaims() effect above has resolved) — every read below assumes claim
    // exists via `(claim as unknown as {...})` casts, which throw immediately on undefined and
    // crash the whole page before the refresh can even complete. Bail out safely here; the
    // claimRefreshTick-triggered re-render once refreshClaims() resolves picks this back up.
    // Bug fixed 2026-08-25: TADA-2026-00083 crashed with "Cannot read properties of undefined
    // (reading 'claimStartDate')" on first load.
    if (!claim) return [];
    const raw = claimLineItems.filter(li => li.expenseType === 'DA');
    const activeFlights = summaryFlights.filter(f => f.Is_cancelled !== 'Yes');
    const addD = (iso: string, n: number) => { if (!iso) return ''; const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

    // Chase forward through same-day connecting legs to find the FINAL arrival — e.g. an
    // international leg landing at a transit city, followed by a domestic connector to the
    // trainer's actual base. Using only the first leg's arrival for "before 12:00"/"same-day
    // India arrival" checks is a bug: Bhavna Singh EMP-3505 flew KL→Chennai (arrives 06:55,
    // before 12:00) then Chennai→Delhi — her actual base — (arrives 13:55, after 12:00). The
    // correct arrival to evaluate is Delhi 13:55, not the Chennai stopover. Mirrors
    // CreateTADABill.tsx's resolveFinalSameDayLeg.
    const resolveFinalSameDayLeg = (startFlight: typeof activeFlights[number]): typeof activeFlights[number] => {
      let current = startFlight;
      for (let hop = 0; hop < 5; hop++) {
        const curArrDate = parseDT(String(current.arrival_date ?? '')) || parseDT(String(current.departure_date ?? ''));
        const curArrTime = String(current.arrival_time ?? '').substring(0, 5);
        const curToCity  = String(current.to_city ?? '').trim().toLowerCase();
        const next = activeFlights.find(f => {
          if (f === current) return false;
          const fromCity = String(f.from_city ?? '').trim().toLowerCase();
          const fd = parseDT(String(f.departure_date ?? ''));
          const ft = String(f.departure_time ?? '').substring(0, 5);
          return !!fromCity && fromCity === curToCity && fd === curArrDate && ft >= curArrTime;
        });
        if (!next) break;
        current = next;
      }
      return current;
    };

    // Apartment name detection helper
    const isApartmentName = (name: string) => /apartment/i.test(name || '');
    // Build apartmentDates Set from PMS accommodation records + lodging claimLineItems
    const apartmentDates = new Set<string>();
    summaryAccom.forEach(r => {
      if (r.Is_caneclled === '1' || r.Is_caneclled === 1) return;
      if (isApartmentName(String(r.AccommodationName ?? ''))) {
        const from = parseDT(String(r.CheckInDate ?? ''));
        const to   = parseDT(String(r.CheckOutDate ?? ''));
        if (from && to && to >= from) {
          const d = new Date(from); const end = new Date(to);
          while (d <= end) { apartmentDates.add(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
        }
      }
    });
    claimLineItems.forEach(li => {
      if ((li.expenseType as string) !== 'Lodging' && (li.expenseType as string) !== 'Hotel') return;
      if (isApartmentName(li.description) && li.date) apartmentDates.add(li.date.slice(0, 10));
    });
    // Long-term stay (≥30 days) and OB/Bench assignment detection
    const longTermAsgnIds = new Set<string>();
    const obAsgnIds = new Set<string>();
    enrichedSummaryAssignments.forEach(a => {
      if (!a.startDate || !a.endDate || !a.assignmentId) return;
      const span = Math.round((new Date(a.endDate).getTime() - new Date(a.startDate).getTime()) / 86400000) + 1;
      if (span >= 30) longTermAsgnIds.add(a.assignmentId);
      const bt = (a.batchType || '').toUpperCase();
      const bc = ((a as unknown as { batchCategory?: string }).batchCategory || '').toUpperCase();
      if (bt === 'OB' || bt.includes('BENCH') || bc.includes('OB') || bc.includes('BENCH')) obAsgnIds.add(a.assignmentId);
    });
    // Layover country detection: 4+ hr non-India layover on a travel day → use that country's DA rate
    const getLayoverCountry = (travelDate: string): { country: string; layoverHours: number } | null => {
      const dayFlights = activeFlights
        .filter(f => parseDT(String(f.departure_date ?? '')) === travelDate)
        .sort((a, b) => String(a.departure_time ?? '').localeCompare(String(b.departure_time ?? '')));
      if (dayFlights.length < 2) return null;
      let best: { country: string; layoverHours: number } | null = null;
      for (let i = 0; i < dayFlights.length - 1; i++) {
        const leg1 = dayFlights[i]; const leg2 = dayFlights[i + 1];
        const arr1Date = parseDT(String(leg1.arrival_date ?? '')) || travelDate;
        const arr1Time = String(leg1.arrival_time ?? '').substring(0, 5);
        const dep2Date = parseDT(String(leg2.departure_date ?? '')) || travelDate;
        const dep2Time = String(leg2.departure_time ?? '').substring(0, 5);
        if (!arr1Time || !dep2Time) continue;
        const toMins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (isNaN(h)?0:h)*60+(isNaN(m)?0:m); };
        const arr1Mins = toMins(arr1Time) + (arr1Date > travelDate ? 1440 : 0);
        const dep2Mins = toMins(dep2Time) + (dep2Date > travelDate ? 1440 : 0);
        const layoverHours = (dep2Mins - arr1Mins) / 60;
        if (layoverHours < 4) continue;
        const layoverCountry = inferCountryFromCity((leg1.to_city as string || '').trim());
        if (!layoverCountry || layoverCountry === 'India') continue;
        if (!best || layoverHours > best.layoverHours) best = { country: layoverCountry, layoverHours };
      }
      return best;
    };

    // PRIMARY: when PMS assignments are available, ALWAYS generate DA from live PMS data.
    // This matches what the trainer sees in Step 4 — DA is always computed from PMS, never from
    // stored claim items (which may have wrong country from an earlier incorrect submission).
    // Stored items (raw) are only used when PMS assignments are completely unavailable.
    let effectiveRaw = raw;
    if (enrichedSummaryAssignments.length > 0) {
      const claimStart = (claim as unknown as { claimStartDate?: string }).claimStartDate ?? '';
      const claimEnd   = (claim as unknown as { claimEndDate?: string }).claimEndDate   ?? '';
      // Build approved-leave date set (Step 3 → Step 4 integration: same as trainer's leaveDates)
      const overrideEmpCode = String((claim as unknown as { trainerId?: string })?.trainerId ?? '').replace(/^EMP-/i, '').trim();
      const approvedLeaveDates = new Set<string>();
      summaryLeaves.forEach(lr => {
        if (!isApprovedLeave(lr.leave_status)) return;
        const fd = lr.from_date ?? ''; const td = lr.to_date ?? '';
        if (!fd) return;
        const start = new Date(fd); const end = td ? new Date(td) : new Date(fd);
        const cur2 = new Date(start);
        while (cur2 <= end) {
          const iso = cur2.toISOString().slice(0, 10);
          // Manual per-record exception — mirrors CreateTADABill.tsx's
          // LEAVE_RECORD_OVERRIDE_EXCLUDE. Vaibhav Gupta EMP-2361, 2026-08-04: HR Admin
          // confirmed he was not actually on leave that day despite the PMS record.
          // Aastha Mehta EMP-3681, 2026-10-12: PMS leave not present in RMS.
          // EMP-2893, 2026-10-05 / 2026-10-07: cancelled by the employee, still in PMS.
          const isOverriddenLeave = [
            '2361|2026-08-04', '3681|2026-10-12', '2893|2026-10-05', '2893|2026-10-07',
          ].includes(`${overrideEmpCode}|${iso}`);
          if (!isOverriddenLeave) approvedLeaveDates.add(iso);
          cur2.setDate(cur2.getDate() + 1);
        }
      });
      if (claimStart && claimEnd) {
        const autoRaw: ClaimLineItem[] = [];
        const cur = new Date(claimStart);
        // Extend the loop end past claimEnd when an assignment is ALREADY IN PROGRESS as of
        // claimEnd (started on/before claimEnd) but its own real end date runs later — e.g. a
        // trainer submits a partial-period claim (20 Aug) mid-way through a 17-21 Aug assignment.
        // The trailing in-assignment days (21 Aug) must still get normal PMS-calculated DA, not be
        // silently skipped just because this claim's own date range ends early. Akshay Kumar
        // EMP-519, TADA-2026-00044, assignment 265769 (17-21 Aug Johannesburg): 21 Aug was missing
        // entirely from the DA table because claimEnd=20 Aug stopped the loop one day short.
        // Every claim sharing this assignment extends through the assignment's own end date and
        // fills between-assignment gaps, regardless of other claims covering the same
        // assignment — per explicit instruction, dedup relies solely on the "Already Paid"
        // greyout (paid-status based), never on hiding rows on an earlier/other claim. An
        // earlier attempt scoped this to only the latest-dated sibling claim, which caused HR
        // to see date ranges vanish from a claim they were actively reviewing whenever a newer
        // claim was later submitted for the same assignment. Reverted 2026-08-25.
        let fin = new Date(claimEnd);
        enrichedSummaryAssignments.forEach(asgn => {
          if (!asgn.startDate || !asgn.endDate) return;
          if (asgn.startDate <= claimEnd && asgn.endDate > claimEnd) {
            const candidateFin = new Date(asgn.endDate);
            if (candidateFin > fin) fin = candidateFin;
          }
        });
        while (cur <= fin) {
          const iso = cur.toISOString().slice(0, 10);
          // Approved leave day → India ₹950 only if trainer has a domestic India flight on this day;
          // otherwise Not Eligible (0)
          if (approvedLeaveDates.has(iso)) {
            const hasDomesticIndiaFlight = activeFlights.some(f => {
              const fd = parseDT(String(f.departure_date ?? ''));
              if (fd !== iso) return false;
              const fromC = inferCountryFromCity(String(f.from_city ?? '').trim());
              const toC   = inferCountryFromCity(String(f.to_city ?? '').trim());
              return fromC === 'India' && toC === 'India';
            });
            if (hasDomesticIndiaFlight) {
              const { rate: indiaRate, currency: indiaCurrency } = getHrDaInfo('India');
              autoRaw.push({
                lineItemId: `AUTO-DA-LV-${claimId}-${iso}`,
                claimId: claimId ?? '', expenseType: 'DA', expenseSubType: 'India', date: iso,
                description: 'Daily Allowance — India (Approved Leave, domestic travel)',
                claimedAmount: indiaRate, policyLimit: indiaRate, eligibleAmount: indiaRate, approvedAmount: 0, deductionAmount: 0,
                currency: indiaCurrency, receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
              });
            } else {
              autoRaw.push({
                lineItemId: `AUTO-DA-LV-${claimId}-${iso}`,
                claimId: claimId ?? '', expenseType: 'DA', expenseSubType: 'Leave', date: iso,
                description: 'Daily Allowance — Not Eligible (Approved Leave)',
                claimedAmount: 0, policyLimit: 0, eligibleAmount: 0, approvedAmount: 0, deductionAmount: 0,
                currency: 'INR', receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
              });
            }
            cur.setDate(cur.getDate() + 1);
            continue;
          }
          const asgn = enrichedSummaryAssignments.find(a => a.startDate && a.endDate && iso >= a.startDate && iso <= a.endDate);
          if (asgn) {
            // ILO/Online batches: DA not applicable per policy
            if (asgn.deliveryMode === 'Online' || asgn.batchType === 'ILO') {
              autoRaw.push({
                lineItemId: `AUTO-DA-ILO-${claimId}-${iso}`,
                claimId: claimId ?? '', expenseType: 'DA', expenseSubType: 'N/A', date: iso,
                description: 'Daily Allowance — Not Applicable (ILO/Online Batch)',
                claimedAmount: 0, policyLimit: 0, eligibleAmount: 0, approvedAmount: 0, deductionAmount: 0,
                currency: 'INR', receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
              });
              cur.setDate(cur.getDate() + 1);
              continue;
            }
            // Delhi-NCR rule: DA not applicable if city is within Delhi-NCR and trainer is not in an apartment
            const asgnCityNorm = (asgn.city || '').toLowerCase().trim();
            if (DELHI_NCR_CITIES.has(asgnCityNorm) && !apartmentDates.has(iso)) {
              autoRaw.push({
                lineItemId: `AUTO-DA-NCR-${claimId}-${iso}`,
                claimId: claimId ?? '', expenseType: 'DA', expenseSubType: 'N/A', date: iso,
                description: 'Daily Allowance — Not Applicable (Delhi-NCR, no apartment stay)',
                claimedAmount: 0, policyLimit: 0, eligibleAmount: 0, approvedAmount: 0, deductionAmount: 0,
                currency: 'INR', receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
              });
              cur.setDate(cur.getDate() + 1);
              continue;
            }
            // Long-term stay: assignment ≥30 days → DA not applicable
            if (asgn.assignmentId && longTermAsgnIds.has(asgn.assignmentId)) {
              autoRaw.push({
                lineItemId: `AUTO-DA-LT-${claimId}-${iso}`,
                claimId: claimId ?? '', expenseType: 'DA', expenseSubType: 'N/A', date: iso,
                description: 'Daily Allowance — Not Applicable (Long-term stay ≥30 days)',
                claimedAmount: 0, policyLimit: 0, eligibleAmount: 0, approvedAmount: 0, deductionAmount: 0,
                currency: 'INR', receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
              });
              cur.setDate(cur.getDate() + 1);
              continue;
            }
            // OB/Bench assignment: DA not applicable
            if (asgn.assignmentId && obAsgnIds.has(asgn.assignmentId)) {
              autoRaw.push({
                lineItemId: `AUTO-DA-OB-${claimId}-${iso}`,
                claimId: claimId ?? '', expenseType: 'DA', expenseSubType: 'N/A', date: iso,
                description: 'Daily Allowance — Not Applicable (OB/Bench assignment)',
                claimedAmount: 0, policyLimit: 0, eligibleAmount: 0, approvedAmount: 0, deductionAmount: 0,
                currency: 'INR', receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
              });
              cur.setDate(cur.getDate() + 1);
              continue;
            }
            const cityCountry = asgn.city ? inferCountryFromCity(asgn.city) : '';
            const destC = (asgn.country === 'India' && cityCountry && cityCountry !== 'India')
              ? cityCountry : (asgn.country || cityCountry || 'India');
            const { rate, currency } = getHrDaInfo(destC);
            if (rate > 0) {
              autoRaw.push({
                lineItemId: `AUTO-DA-${claimId}-${iso}`,
                claimId: claimId ?? '', expenseType: 'DA', expenseSubType: destC, date: iso,
                description: `Daily Allowance — ${destC} (PMS auto-calculated)`,
                claimedAmount: rate, policyLimit: rate, eligibleAmount: rate, approvedAmount: 0, deductionAmount: 0,
                currency, receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
              });
            }
          }
          cur.setDate(cur.getDate() + 1);
        }
        // Return travel day supplement: flight AFTER assignment end.
        // Policy (mirrors CreateTADABill.tsx isReturn branch): check the DEPARTURE time FROM the
        // destination country, not the arrival time at some later leg/layover. If the trainer departs
        // the destination country at/after 04:00 local, they spent most of the day there → full
        // destination-country DA. If they depart before 04:00, they didn't spend meaningful time
        // there on the return day → India DA instead.
        enrichedSummaryAssignments.forEach(asgn => {
          if (!asgn.startDate || !asgn.endDate) return;
          if (asgn.deliveryMode === 'Online' || asgn.batchType === 'ILO') return;
          const cityCountry = asgn.city ? inferCountryFromCity(asgn.city) : '';
          const destC = (asgn.country === 'India' && cityCountry && cityCountry !== 'India')
            ? cityCountry : (asgn.country || cityCountry || 'India');
          const { rate, currency: destCurrency } = getHrDaInfo(destC);
          if (rate <= 0) return;
          // Find the EARLIEST return flight departing FROM the destination city/country after
          // assignment ends — .find() alone picks unsorted API array order, not chronological
          // order. Fixed 2026-08-11 (same class as the outbound-leg regression).
          const retFlightCandidates = activeFlights.filter(f => {
            const fd = parseDT(String(f.departure_date ?? ''));
            return fd ? fd > asgn.endDate! && fd <= addD(asgn.endDate!, 5) && inferCountryFromCity(String(f.from_city ?? '').trim()) === destC : false;
          });
          const retFlight = retFlightCandidates.length === 0 ? null
            : retFlightCandidates.reduce((earliest, f) => {
                const ed = parseDT(String(earliest.departure_date ?? '')) || '';
                const fd = parseDT(String(f.departure_date ?? '')) || '';
                if (fd < ed) return f;
                if (fd > ed) return earliest;
                const et = String(earliest.departure_time ?? '').substring(0, 5);
                const ft = String(f.departure_time ?? '').substring(0, 5);
                return ft < et ? f : earliest;
              });
          if (!retFlight) return;
          const fd = parseDT(String(retFlight.departure_date ?? ''));
          if (!fd) return;

          // Post-batch interim days: fill every day strictly between assignment end and the
          // return travel day with destination-country DA — the trainer is still in-country,
          // awaiting the return flight (e.g. batch ends 20 Aug, return flight isn't until 23
          // Aug — 21 and 22 Aug are missing entirely without this). Mirrors CreateTADABill.tsx's
          // "Post-Batch In-Country" days and the existing pre-batch fill above. Bug fixed
          // 2026-08-24: Vaibhav Gupta EMP-2361, TADA-2026-00071, Asgn #263197 (Austria) — HR
          // Admin's DA table had no rows at all for 21-23 Aug, even though the trainer's own
          // submission correctly showed them as Austria days.
          {
            const postCur = new Date(asgn.endDate!);
            postCur.setDate(postCur.getDate() + 1);
            const postEndExclusive = new Date(fd);
            while (postCur < postEndExclusive) {
              const iso = postCur.toISOString().slice(0, 10);
              if (!autoRaw.some(li => li.date === iso)) {
                autoRaw.push({
                  lineItemId: `AUTO-DA-POSTBATCH-${claimId}-${iso}`,
                  claimId: claimId ?? '', expenseType: 'DA', expenseSubType: destC, date: iso,
                  description: `Daily Allowance — ${destC} (post-batch, in-country)`,
                  claimedAmount: rate, policyLimit: rate, eligibleAmount: rate, approvedAmount: 0, deductionAmount: 0,
                  currency: destCurrency, receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
                });
              }
              postCur.setDate(postCur.getDate() + 1);
            }
          }

          if (autoRaw.some(li => li.date === fd)) return;

          // If this return leg lands in India the SAME calendar day (a direct flight home,
          // not an overnight/multi-leg connection through a layover country), the "arrival
          // before 12:00 → Not Eligible" policy check takes priority over the departure-time
          // rule below. The departure-time rule is only for legs that do NOT land in India
          // same day (e.g. Sagnik Ghosh's Sydney→Bangkok→Delhi, landing in India the NEXT
          // day — handled by the overnight-arrival logic elsewhere, not this branch).
          // Bug fixed 2026-08-10: Magesh Kumar Palani EMP-3640 — KL→Chennai direct flight,
          // dep 05:45 (≥04:00, so the old code wrongly gave full Malaysia DA), arrives
          // Chennai 06:55 (before 12:00) — should be Not Eligible, not Malaysia DA.
          // Chase to the FINAL same-day connecting leg first — Bhavna Singh EMP-3505 flew
          // KL→Chennai (arrives 06:55) then Chennai→Delhi, her actual base (arrives 13:55,
          // after 12:00) — must evaluate the Delhi arrival, not the Chennai stopover.
          const finalRetLeg = resolveFinalSameDayLeg(retFlight);
          const retToCountry = inferCountryFromCity(String(finalRetLeg.to_city ?? '').trim());
          const retArrDate = parseDT(String(finalRetLeg.arrival_date ?? '')) || fd;
          if (retToCountry === 'India' && retArrDate === fd) {
            const arrHHMM = String(finalRetLeg.arrival_time ?? '').substring(0, 5);
            if (arrHHMM && arrHHMM <= '12:00') {
              autoRaw.push({
                lineItemId: `AUTO-DA-RET-${claimId}-${fd}`,
                claimId: claimId ?? '', expenseType: 'DA', expenseSubType: 'N/A', date: fd,
                description: `Not Eligible — Return Arrival Before 12:00 (arrives ${arrHHMM})`,
                claimedAmount: 0, policyLimit: 0, eligibleAmount: 0, approvedAmount: 0, deductionAmount: 0,
                currency: 'INR', receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
              });
              return;
            }
            // Eligible (arrives after 12:00) and lands in India same day — still apply the
            // same >=04:00 departure-time cutoff used below, rather than always defaulting to
            // India just because the connecting flight happened to land in India that day.
            // Bug fixed 2026-08-20: Pratik EMP-3214 departed Manila (Philippines) at 12:30
            // local, a short (<4 hr) Hong Kong connection, landing Mumbai 21:05 the same day —
            // he spent the working part of the day in the Philippines and should get
            // Philippines DA, not India. Only an early (<04:00 local) departure — i.e.
            // negligible time actually spent in the destination country that day — falls back
            // to India DA (still correct for the original fix this branch covers, Bhavna Singh
            // EMP-3505, who departed KL before 04:00 local to arrive Chennai 06:55).
            const depHHMMSameDay = String(retFlight.departure_time ?? '').substring(0, 5);
            if (destC !== 'India' && depHHMMSameDay && depHHMMSameDay >= '04:00') {
              autoRaw.push({
                lineItemId: `AUTO-DA-RET-${claimId}-${fd}`,
                claimId: claimId ?? '', expenseType: 'DA', expenseSubType: destC, date: fd,
                description: `Daily Allowance — ${destC} (return travel day, dep ${depHHMMSameDay} >= 04:00, arrives home ${arrHHMM || '?'} > 12:00)`,
                claimedAmount: rate, policyLimit: rate, eligibleAmount: rate, approvedAmount: 0, deductionAmount: 0,
                currency: destCurrency, receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
              });
              return;
            }
            const { rate: indiaRate, currency: indiaCurrency } = getHrDaInfo('India');
            autoRaw.push({
              lineItemId: `AUTO-DA-RET-${claimId}-${fd}`,
              claimId: claimId ?? '', expenseType: 'DA', expenseSubType: 'India', date: fd,
              description: `Daily Allowance — India (return travel day, arrives home ${arrHHMM || '?'} > 12:00)`,
              claimedAmount: indiaRate, policyLimit: indiaRate, eligibleAmount: indiaRate, approvedAmount: 0, deductionAmount: 0,
              currency: indiaCurrency, receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
            });
            return;
          }

          // OVERNIGHT return flight landing in India the NEXT calendar day (retArrDate !== fd —
          // e.g. London 22 Aug 20:55 -> Delhi 23 Aug 13:15). The logic below this point only ever
          // dates its row at `fd` (the departure day), crediting destC for the day the trainer
          // left — correct on its own, but the arrival day in India (23 Aug) then got NO row at
          // all, silently skipped. Add it here as its own entry, using the same >12:00 eligibility
          // cutoff as the same-day case above, then fall through (no `return`) so the fd-day
          // destC/India row below is still generated as usual. Bug fixed 2026-08-24: Bhaskar
          // Kumar Dixit EMP-1920, TADA-2026-00070 — 23 Aug (arrival, 13:15, after 12:00) was
          // missing entirely from the DA table.
          if (retToCountry === 'India' && retArrDate !== fd && !autoRaw.some(li => li.date === retArrDate)) {
            const arrHHMM2 = String(finalRetLeg.arrival_time ?? '').substring(0, 5);
            if (arrHHMM2 && arrHHMM2 <= '12:00') {
              autoRaw.push({
                lineItemId: `AUTO-DA-RETARR-${claimId}-${retArrDate}`,
                claimId: claimId ?? '', expenseType: 'DA', expenseSubType: 'N/A', date: retArrDate,
                description: `Not Eligible — Return Arrival Before 12:00 (arrives ${arrHHMM2})`,
                claimedAmount: 0, policyLimit: 0, eligibleAmount: 0, approvedAmount: 0, deductionAmount: 0,
                currency: 'INR', receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
              });
            } else {
              const { rate: indiaRate, currency: indiaCurrency } = getHrDaInfo('India');
              autoRaw.push({
                lineItemId: `AUTO-DA-RETARR-${claimId}-${retArrDate}`,
                claimId: claimId ?? '', expenseType: 'DA', expenseSubType: 'India', date: retArrDate,
                description: `Daily Allowance — India (return arrival day, arrives ${arrHHMM2 || '?'} > 12:00)`,
                claimedAmount: indiaRate, policyLimit: indiaRate, eligibleAmount: indiaRate, approvedAmount: 0, deductionAmount: 0,
                currency: indiaCurrency, receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
              });
            }
          }

          // If the flight is NOT heading to India — i.e. the trainer is continuing straight to
          // a DIFFERENT international destination, not returning home — this day genuinely
          // belongs to that new assignment/claim, not this one. Do not fabricate an "India"
          // entry just because departure was before 04:00. Bug fixed 2026-08-10: Ankur Kumar
          // EMP-2485 — this claim only covers Dubai (ends 16 Jul); his 19 Jul flight was
          // Dubai→Nairobi (continuing to a new international assignment), not a return to
          // India, so no DA line item should be fabricated here for that date.
          //
          // Must chase through ALL subsequent connecting legs (not just same-day ones) to find
          // the TRUE final destination before deciding this — checking only the immediate next
          // leg's to_city wrongly treated a transit hub as the final destination. Bug fixed
          // 2026-08-19: Vaibhav Gupta EMP-2361, TADA-2026-00024 — Vienna→Doha (08 Aug, a transit
          // layover) then Doha→Delhi (09 Aug, next calendar day so the same-day-only chase used
          // elsewhere in this file didn't reach it) actually lands in India; checking only the
          // Doha leg wrongly looked like "heading to Qatar, a different destination" and the
          // whole 08 Aug return-day row was silently skipped instead of correctly showing Austria.
          // Stop chasing the instant a leg lands in India (the trainer is home — a LATER,
          // unrelated flight from that same Indian city days afterward, e.g. the start of a
          // completely different future assignment, must never be treated as "still travelling").
          // Also cap each hop to a 2-day connection window — a genuine layover/connection is
          // short; anything further out is a separate trip, not part of this return journey.
          // Bug fixed 2026-08-19 (second pass): Vaibhav Gupta EMP-2361, TADA-2026-00024 — the
          // first attempt at this chase kept hopping past the Doha->Delhi arrival (which DOES
          // land in India) all the way to a Delhi->Doha flight 6 days later (the start of his
          // NEXT trip) and then on to Vienna->Amsterdam, wrongly concluding "Netherlands" and
          // dropping the whole 08 Aug row.
          const resolveFinalDestCountry = (startFlight: typeof activeFlights[number]): string => {
            let current = startFlight;
            for (let hop = 0; hop < 5; hop++) {
              const curToCity = String(current.to_city ?? '').trim().toLowerCase();
              const curCountry = inferCountryFromCity(String(current.to_city ?? '').trim());
              if (curCountry === 'India') return 'India';
              const curArrDate = parseDT(String(current.arrival_date ?? '')) || parseDT(String(current.departure_date ?? ''));
              const next = activeFlights.find(f => {
                if (f === current) return false;
                const fromCity = String(f.from_city ?? '').trim().toLowerCase();
                const fd = parseDT(String(f.departure_date ?? ''));
                return !!fromCity && fromCity === curToCity && !!fd && fd >= curArrDate && fd <= addD(curArrDate, 2);
              });
              if (!next) break;
              current = next;
            }
            return inferCountryFromCity(String(current.to_city ?? '').trim());
          };
          const retToCountryFinal = resolveFinalDestCountry(retFlight);
          const depHHMM = String(retFlight.departure_time ?? '').substring(0, 5);

          // The trainer PHYSICALLY spent this day in destC (Austria) until departure — that fact
          // holds regardless of where the flight ultimately leads (a return to India, or the
          // start of an entirely new assignment). Crediting destC for a >=04:00 departure is
          // always safe and matches the trainer's own CreateTADABill.tsx submission. What is NOT
          // safe is fabricating an "India" credit when the trainer never actually went to India —
          // that fabrication only matters in the dep<04:00 branch below, so the "different
          // assignment" check only needs to guard THAT branch. Bug fixed 2026-08-24: Vaibhav
          // Gupta EMP-2361, TADA-2026-00071 — Vienna->Amsterdam dep 14:20 (his next assignment,
          // #265591, starts 31 Aug) was voiding the ENTIRE day instead of just skipping the
          // India-guess; HR Admin showed no row at all for 23 Aug while the trainer's own bill
          // correctly showed Austria.
          if (destC !== 'India' && depHHMM && depHHMM >= '04:00') {
            // Departs destination country at/after 04:00 — spent most of the day there
            autoRaw.push({
              lineItemId: `AUTO-DA-RET-${claimId}-${fd}`,
              claimId: claimId ?? '', expenseType: 'DA', expenseSubType: destC, date: fd,
              description: `Daily Allowance — ${destC} (return travel day, dep ${depHHMM || '?'} >= 04:00)`,
              claimedAmount: rate, policyLimit: rate, eligibleAmount: rate, approvedAmount: 0, deductionAmount: 0,
              currency: destCurrency, receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
            });
          } else if (retToCountryFinal && retToCountryFinal !== 'India' && retToCountryFinal !== destC &&
            enrichedNearbyAssignments.some(a =>
              a.assignmentId !== asgn.assignmentId && a.startDate &&
              a.startDate >= fd && a.startDate <= addD(fd, 10) &&
              a.city && inferCountryFromCity(a.city) === retToCountryFinal
            )) {
            // Ankur Kumar EMP-2485 case: dep < 04:00 heading toward a genuine NEW assignment in a
            // different country, not India — do not fabricate an India credit for this day.
          } else {
            // Departs before 04:00 (or destC already India) — India DA for the return travel day
            const { rate: indiaRate, currency: indiaCurrency } = getHrDaInfo('India');
            autoRaw.push({
              lineItemId: `AUTO-DA-RET-${claimId}-${fd}`,
              claimId: claimId ?? '', expenseType: 'DA', expenseSubType: 'India', date: fd,
              description: `Daily Allowance — India (return travel day, dep ${depHHMM || '?'} < 04:00)`,
              claimedAmount: indiaRate, policyLimit: indiaRate, eligibleAmount: indiaRate, approvedAmount: 0, deductionAmount: 0,
              currency: indiaCurrency, receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
            });
          }
        });

        // Departure travel day supplement: flight BEFORE assignment start → DA if departure < 17:00.
        // Window widened to -6 days (was -2) to catch trainers who arrive several days early and
        // stay locally before the batch begins (e.g. Mayur Bhushan Kotoky EMP-2441 arrived in
        // Bangalore 31 Jul for a 03 Aug batch start — a 3-day gap the old -2 window missed entirely).
        enrichedSummaryAssignments.forEach(asgn => {
          if (!asgn.startDate) return;
          if (asgn.deliveryMode === 'Online' || asgn.batchType === 'ILO') return;
          const depCandidates = activeFlights.filter(f => {
            const fd = parseDT(String(f.departure_date ?? ''));
            return fd ? fd >= addD(asgn.startDate!, -6) && fd < asgn.startDate! : false;
          });
          // Priority 1: the LATEST candidate whose to_city exactly matches the assignment's
          // training city — the actual final leg that brought the trainer to the destination,
          // regardless of how many days before start it departed.
          const cityMatches = asgn.city
            ? depCandidates.filter(f => String(f.to_city ?? '').trim().toLowerCase() === asgn.city!.trim().toLowerCase())
            : [];
          const cityMatchPick = cityMatches.length === 0 ? null
            : cityMatches.reduce((latest, f) => {
                const ld = parseDT(String(latest.departure_date ?? '')) || '';
                const fd = parseDT(String(f.departure_date ?? '')) || '';
                return fd > ld ? f : latest;
              });
          // Priority 2 (fallback): prefer the leg that actually departs FROM India to an
          // international destination (avoids picking domestic connecting flights like
          // Ranchi→Delhi before an international leg). Priority 3: EARLIEST-departing leg —
          // not array order — so a later connecting leg (which may depart after 17:00)
          // doesn't wrongly disqualify the whole travel day.
          const depFlight = cityMatchPick ?? depCandidates.find(f => {
            const fromC = inferCountryFromCity(String(f.from_city ?? '').trim());
            const toC   = inferCountryFromCity(String(f.to_city ?? '').trim());
            return fromC === 'India' && toC !== 'India';
          }) ?? depCandidates.reduce((earliest, f) => {
            if (!earliest) return f;
            const et = String(earliest.departure_time ?? '').substring(0, 5);
            const ft = String(f.departure_time ?? '').substring(0, 5);
            return ft < et ? f : earliest;
          }, depCandidates[0]);
          if (!depFlight) return;
          const fd = parseDT(String(depFlight.departure_date ?? ''));
          if (!fd) return;

          // Domestic feeder leg: the chosen international/final departure leg (depFlight) may
          // itself have been fed by an earlier-departing DOMESTIC leg (e.g. Bangalore->Delhi)
          // landing at depFlight's own departure city, on an EARLIER calendar date. That earlier
          // date is when the trainer actually left their home base and deserves its own India DA
          // — it's a separate travel event from the international leg's own date, not covered by
          // the departure day itself (different date) nor the pre-batch interim fill below (which
          // only fills days AFTER fd, never before it). Bug fixed 2026-08-31: TADA-2026-00112
          // (Abhishek Soni, Asgn #266767) — Bangalore->Delhi dep 21-Aug 16:30, then Delhi->Zurich
          // dep 22-Aug 01:05 (after midnight); Priority 2 above correctly picked the Delhi->Zurich
          // leg as the international travel day, but 21-Aug (when he actually left Bangalore) was
          // silently dropped entirely.
          const feederLeg = activeFlights
            .filter(f => {
              const ffd = parseDT(String(f.departure_date ?? ''));
              if (!ffd || ffd >= fd) return false;
              if (addD(ffd, 2) < fd) return false; // within 2 days before the main leg
              return String(f.to_city ?? '').trim().toLowerCase() === String(depFlight.from_city ?? '').trim().toLowerCase();
            })
            .reduce((latest, f) => {
              if (!latest) return f;
              const ld = parseDT(String(latest.departure_date ?? '')) || '';
              const fdd = parseDT(String(f.departure_date ?? '')) || '';
              return fdd > ld ? f : latest;
            }, undefined as typeof activeFlights[number] | undefined);
          if (feederLeg) {
            const feederDate = parseDT(String(feederLeg.departure_date ?? ''));
            const feederHHMM = String(feederLeg.departure_time ?? '').substring(0, 5);
            if (feederDate && !autoRaw.some(li => li.date === feederDate) && (!feederHHMM || feederHHMM < '17:00')) {
              const { rate: feederRate, currency: feederCurrency } = getHrDaInfo('India');
              if (feederRate > 0) {
                autoRaw.push({
                  lineItemId: `AUTO-DA-FEEDER-${claimId}-${feederDate}`,
                  claimId: claimId ?? '', expenseType: 'DA', expenseSubType: 'India', date: feederDate,
                  description: `Daily Allowance — India (departure day, connecting to international flight, dep ${feederHHMM || '?'} < 17:00)`,
                  claimedAmount: feederRate, policyLimit: feederRate, eligibleAmount: feederRate, approvedAmount: 0, deductionAmount: 0,
                  currency: feederCurrency, receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
                });
              }
            }
          }

          if (autoRaw.some(li => li.date === fd)) return;
          // Policy: departure travel day DA only if departure is before 17:00. This must be
          // checked against the EARLIEST leg departing on THIS specific date (fd) — not
          // necessarily depFlight itself, which (via cityMatchPick) may be a LATER connecting
          // leg on the same day chosen only to identify the correct destination/travel date.
          // Bug fixed 2026-08-11: Girish Kumar EMP-207 — Chandigarh→Hyderabad (dep 15:30) then
          // Hyderabad→Chennai (dep 20:40) same day; cityMatchPick correctly identified 12 Jul
          // as the travel day via the Chennai-arriving leg, but then wrongly used THAT leg's
          // 20:40 departure (≥17:00) for eligibility instead of the trainer's actual 15:30
          // departure from home — silently dropping the whole day.
          const earliestOnFd = depCandidates
            .filter(f => parseDT(String(f.departure_date ?? '')) === fd)
            .reduce((earliest, f) => {
              if (!earliest) return f;
              const et = String(earliest.departure_time ?? '').substring(0, 5);
              const ft = String(f.departure_time ?? '').substring(0, 5);
              return ft < et ? f : earliest;
            }, depFlight);
          const depHHMM = String(earliestOnFd.departure_time ?? '').substring(0, 5);
          // Departure-day DA itself requires dep < 17:00, but that check must NOT skip the
          // pre-batch interim-day fill below — those are separate, unrelated concerns. Bug fixed
          // 2026-08-31: TADA-2026-02971 (Praveen Kumar, Asgn #261611) — dep Delhi->Tokyo 24-Jul
          // 18:15 (overnight, arrives Tokyo 25-Jul, correctly picked up by the separate overnight-
          // arrival rule below), assignment starts 27-Jul. Because 18:15 >= 17:00, this whole
          // callback used to `return` here, so 26-Jul (the in-country gap day between the 25-Jul
          // arrival and the 27-Jul batch start) never got filled by anything — a day the trainer
          // was genuinely in Japan with no DA at all. The >=17:00 rule only disqualifies same-day
          // departure DA (the trainer wasn't in destination yet at 18:15 on 24-Jul); it has no
          // bearing on days AFTER arrival.
          const grantDepartureDayDa = !(depHHMM && depHHMM >= '17:00');
          const cityCountry = asgn.city ? inferCountryFromCity(asgn.city) : '';
          const destC = (asgn.country === 'India' && cityCountry && cityCountry !== 'India')
            ? cityCountry : (asgn.country || cityCountry || 'India');
          const { rate, currency } = getHrDaInfo(destC);
          if (rate <= 0) return;
          if (grantDepartureDayDa) {
            autoRaw.push({
              lineItemId: `AUTO-DA-DEP-${claimId}-${fd}`,
              claimId: claimId ?? '', expenseType: 'DA', expenseSubType: destC, date: fd,
              description: `Daily Allowance — ${destC} (departure travel day, dep ${depHHMM || '?'} < 17:00)`,
              claimedAmount: rate, policyLimit: rate, eligibleAmount: rate, approvedAmount: 0, deductionAmount: 0,
              currency, receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
            });
          }

          // Pre-batch interim days: fill every day strictly between the travel day (fd) and
          // assignment start with destination-country DA — the trainer is already in-country
          // (e.g. 01 Aug and 02 Aug between a 31 Jul arrival and a 03 Aug batch start). Mirrors
          // CreateTADABill.tsx's interimAsgn logic, which ClaimDetail.tsx previously had no
          // equivalent for at all.
          if (rate > 0) {
            const cur = new Date(fd);
            cur.setDate(cur.getDate() + 1);
            // Normally the assignment's own start date gets picked up by the main day-by-day
            // loop above (which runs from the claim's claimStartDate). But when the claim's own
            // claimStartDate is LATER than the assignment's actual start date (e.g. a claim
            // submitted covering only part of a multi-day assignment), that loop never reaches
            // the assignment's start date at all — and this interim fill previously stopped
            // BEFORE it too (exclusive), leaving that one day with no DA anywhere. Extend the
            // fill through the later of the two so it's never skipped. Bug fixed 2026-08-20:
            // TADA-2026-00030 (Akshay Kumar, Asgn #265769) — assignment starts 17 Aug, but the
            // claim's own claimStartDate is 18 Aug, so 17 Aug (South Africa) was missing.
            const endExclusive = new Date(claimStart && claimStart > asgn.startDate! ? claimStart : asgn.startDate!);
            while (cur < endExclusive) {
              const iso = cur.toISOString().slice(0, 10);
              if (!autoRaw.some(li => li.date === iso)) {
                autoRaw.push({
                  lineItemId: `AUTO-DA-PREBATCH-${claimId}-${iso}`,
                  claimId: claimId ?? '', expenseType: 'DA', expenseSubType: destC, date: iso,
                  description: `Daily Allowance — ${destC} (pre-batch, in-country)`,
                  claimedAmount: rate, policyLimit: rate, eligibleAmount: rate, approvedAmount: 0, deductionAmount: 0,
                  currency, receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
                });
              }
              cur.setDate(cur.getDate() + 1);
            }
          }
        });

        // Overnight outbound connecting-flight arrival: when the first outbound leg (e.g. Delhi→Bangkok)
        // doesn't land in the assignment's destination country the same day, and a CONNECTING leg
        // (e.g. Bangkok→Sydney, departs late night, arrives next calendar day) lands there instead,
        // that arrival date must get full destination-country DA — the trainer is physically there
        // for the whole day. Mirrors resolveArrDate/overnightDepArrAsgn from CreateTADABill.tsx.
        enrichedSummaryAssignments.forEach(asgn => {
          if (!asgn.startDate) return;
          if (asgn.deliveryMode === 'Online' || asgn.batchType === 'ILO') return;
          const cityCountry = asgn.city ? inferCountryFromCity(asgn.city) : '';
          const destC = (asgn.country === 'India' && cityCountry && cityCountry !== 'India')
            ? cityCountry : (asgn.country || cityCountry || 'India');
          if (destC === 'India') return;
          const resolveArrDate = (f: typeof activeFlights[number]): string => {
            const raw = String(f.arrival_date ?? '').trim();
            if (raw) return parseDT(raw);
            const depD    = parseDT(String(f.departure_date ?? ''));
            const depTime = String(f.departure_time ?? '').substring(0, 5);
            if (depD && depTime && depTime >= '18:00') return addD(depD, 1);
            return '';
          };
          const windowStart = addD(asgn.startDate!, -5);
          const windowEnd   = asgn.startDate!;
          // Find the overnight leg first (departs late enough, or has arrival_date set, to land
          // the NEXT calendar day) WITHOUT requiring it to land directly in destC — it may only
          // be a transit hop (e.g. Mumbai->Hongkong). Then chase FORWARD through same-day
          // connecting legs (same as resolveFinalSameDayLeg elsewhere in this file) to find
          // where the trainer actually ends up. Checking each leg in isolation missed the case
          // where the overnight leg reaches a transit city and a SAME-DAY connecting leg then
          // reaches the real destination — neither leg alone is "overnight AND arrives at destC".
          // Bug fixed 2026-08-21: Pratik Khuthia EMP-3214, Asgn #261704 — Mumbai->Hongkong (dep
          // 11 Aug 22:25, arrives Hongkong 12 Aug 06:55, overnight but NOT the destination) then
          // Hongkong->Manila (dep 12 Aug 09:00, arrives 12 Aug 11:20, same-day but IS the
          // destination) — 12 Aug got no DA at all because neither leg matched both conditions.
          const overnightCandidate = activeFlights.find(f => {
            const arrDate = resolveArrDate(f);
            if (!arrDate) return false;
            const depDate = parseDT(String(f.departure_date ?? ''));
            if (!depDate || depDate >= arrDate) return false; // must be overnight (arrival later than departure)
            if (depDate < windowStart || depDate > windowEnd) return false;
            return true;
          });
          if (!overnightCandidate) return;
          const finalLeg = resolveFinalSameDayLeg(overnightCandidate);
          const finalToCountry = inferCountryFromCity(String(finalLeg.to_city ?? '').trim());
          if (finalToCountry !== destC) return;
          const arrIso = resolveArrDate(finalLeg) || resolveArrDate(overnightCandidate);
          if (!arrIso || autoRaw.some(li => li.date === arrIso)) return;
          const { rate, currency } = getHrDaInfo(destC);
          if (rate <= 0) return;
          autoRaw.push({
            lineItemId: `AUTO-DA-OVERNIGHT-${claimId}-${arrIso}`,
            claimId: claimId ?? '', expenseType: 'DA', expenseSubType: destC, date: arrIso,
            description: `Daily Allowance — ${destC} (overnight connecting-flight arrival)`,
            claimedAmount: rate, policyLimit: rate, eligibleAmount: rate, approvedAmount: 0, deductionAmount: 0,
            currency, receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
          });
        });

        // Weekend/gap-fill: for each of THIS claim's assignments, find its immediately
        // adjacent neighbor (from enrichedNearbyAssignments) at the same country with ≤ 7-day gap.
        // We only pair a current-claim assignment with its nearest neighbor — never
        // do all-pairs across the entire nearby list (that would pull in historical gaps).
        // Reverted 2026-08-25 per explicit instruction (see extend-past-claimEnd block above):
        // every claim sharing this assignment shows the full gap-fill too, regardless of other
        // claims covering the same assignment — dedup relies solely on the "Already Paid"
        // greyout, not on hiding rows here.
        {
          const getDestC = (a: { country?: string; city?: string }) => {
            const cc = a.city ? inferCountryFromCity(a.city) : '';
            return (a.country === 'India' && cc && cc !== 'India') ? cc : (a.country || cc || 'India');
          };
          const nearbyFmat = enrichedNearbyAssignments
            .filter(a => a.deliveryMode !== 'Online' && a.batchType !== 'ILO' && a.startDate && a.endDate);
          const processedGaps = new Set<string>();

          enrichedSummaryAssignments
            .filter(sa => sa.deliveryMode !== 'Online' && sa.batchType !== 'ILO' && sa.startDate && sa.endDate)
            .forEach(sa => {
              const destA = getDestC(sa);

              // Look FORWARD: find the immediately next assignment after this one
              const nextAsgn = nearbyFmat
                .filter(na => na.startDate! > sa.endDate!)
                .sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1))[0];
              if (nextAsgn) {
                const destB = getDestC(nextAsgn);
                const gapStart = addD(sa.endDate!, 1);
                const gapEnd   = addD(nextAsgn.startDate!, -1);
                const key = `${gapStart}|${gapEnd}`;
                if (gapStart <= gapEnd && !processedGaps.has(key)) {
                  const gapDays = Math.round((new Date(gapEnd).getTime() - new Date(gapStart).getTime()) / 86400000) + 1;
                  if (gapDays <= 7) {
                    // Same-country gap: ONLY assume the trainer stayed put if there is no flight
                    // evidence to the contrary. Blanket-filling every day just because both
                    // assignments happen to be in the same country was an assumption, not a
                    // fact — a trainer can fly home (or anywhere else) mid-gap and come back for
                    // the next assignment. If ANY flight departs from destA during the gap
                    // window, that's real evidence of movement, so do NOT auto-fill; leave it for
                    // HR to review manually instead of guessing. Bug fixed 2026-08-20: multiple
                    // consecutive "between consecutive assignments" DA rows were being generated
                    // for a same-country gap without checking whether the trainer actually left
                    // and returned during it.
                    // DIFFERENT-country gap (e.g. Ankur Kumar EMP-2485: Dubai batch ends 16 Jul,
                    // Nairobi batch starts 20 Jul): trainer stayed in destA's country until a
                    // connecting flight to destB departs. Only fill days up to (not including)
                    // that flight's departure — the departure day itself is handled separately
                    // by the normal departure-travel-day supplement logic.
                    let fillEnd = gapEnd;
                    let bridgeOk: boolean;
                    if (destA === destB) {
                      const anyDepartureDuringGap = activeFlights.some(f => {
                        const fd = parseDT(String(f.departure_date ?? ''));
                        if (!fd || fd < gapStart || fd > gapEnd) return false;
                        const fromC = inferCountryFromCity(String(f.from_city ?? '').trim());
                        return fromC === destA;
                      });
                      bridgeOk = !anyDepartureDuringGap;
                    } else {
                      bridgeOk = false;
                      const bridgingFlight = activeFlights.find(f => {
                        const fd = parseDT(String(f.departure_date ?? ''));
                        if (!fd || fd < gapStart || fd > addD(gapEnd, 1)) return false;
                        const fromC = inferCountryFromCity(String(f.from_city ?? '').trim());
                        const toC   = inferCountryFromCity(String(f.to_city ?? '').trim());
                        return fromC === destA && toC === destB;
                      });
                      if (bridgingFlight) {
                        const bridgeDepDate = parseDT(String(bridgingFlight.departure_date ?? ''));
                        if (bridgeDepDate) {
                          fillEnd = addD(bridgeDepDate, -1);
                          bridgeOk = fillEnd >= gapStart;
                        }
                      }
                    }
                    if (bridgeOk) {
                      processedGaps.add(key);
                      const { rate, currency } = getHrDaInfo(destA);
                      // Trainer is physically at `sa`'s (the earlier assignment's) location for
                      // this whole gap — same Delhi-NCR-without-apartment rule applies here as to
                      // in-assignment days, or a weekend gap between two Gurgaon/Delhi assignments
                      // silently re-grants DA the main per-day loop would have denied.
                      const gapCityNorm = (sa.city || '').toLowerCase().trim();
                      const gapIsNcr = DELHI_NCR_CITIES.has(gapCityNorm);
                      if (rate > 0 || gapIsNcr) {
                        let gc = new Date(gapStart); const gf = new Date(fillEnd);
                        while (gc <= gf) {
                          const iso = gc.toISOString().slice(0, 10);
                          if (!autoRaw.some(li => li.date === iso) && !approvedLeaveDates.has(iso)) {
                            if (gapIsNcr && !apartmentDates.has(iso)) {
                              autoRaw.push({
                                lineItemId: `AUTO-DA-NCR-${claimId}-${iso}`,
                                claimId: claimId ?? '', expenseType: 'DA', expenseSubType: 'N/A', date: iso,
                                description: 'Daily Allowance — Not Applicable (Delhi-NCR, no apartment stay)',
                                claimedAmount: 0, policyLimit: 0, eligibleAmount: 0, approvedAmount: 0, deductionAmount: 0,
                                currency: 'INR', receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
                              });
                            } else if (rate > 0) {
                              autoRaw.push({
                                lineItemId: `AUTO-DA-GAP-${claimId}-${iso}`,
                                claimId: claimId ?? '', expenseType: 'DA', expenseSubType: destA, date: iso,
                                description: `Daily Allowance — ${destA} (between consecutive assignments)`,
                                claimedAmount: rate, policyLimit: rate, eligibleAmount: rate, approvedAmount: 0, deductionAmount: 0,
                                currency, receiptRequired: false, receiptUploaded: false, exceptionRequired: false,
                              });
                            }
                          }
                          gc.setDate(gc.getDate() + 1);
                        }
                      }
                    }
                  }
                }
              }

              // NOTE: No backward look — gap days belong only to the earlier bill (the one
              // whose assignment ends just before the gap). Looking backward would duplicate
              // the gap into both bills and cause double-payment.
            });
        }

        if (autoRaw.length > 0) effectiveRaw = autoRaw;
      }
    }

    // Third fallback: PMS unavailable AND no stored DA items at all.
    // Only runs when both stored items AND PMS auto-generate produced nothing.
    // Must NOT override PMS-generated items — those already have correct country from live data.
    if (effectiveRaw.length === 0) {
      const claimStart = (claim as unknown as { claimStartDate?: string }).claimStartDate ?? '';
      const claimEnd   = (claim as unknown as { claimEndDate?: string }).claimEndDate   ?? '';
      const trainingLoc = (claim as unknown as { trainingLocation?: string }).trainingLocation ?? '';
      const destCities: string[] = (claim as unknown as { destinationCities?: string[] }).destinationCities ?? [];
      if (claimStart && claimEnd) {
        // Derive country: prefer first non-India city in destinationCities, else infer from trainingLocation
        const destC = destCities.find(c => c && c !== 'India')
          || (trainingLoc ? inferCountryFromCity(trainingLoc) : '')
          || 'India';
        const { rate, currency } = getHrDaInfo(destC);
        if (rate > 0) {
          const autoRaw: ClaimLineItem[] = [];
          const cur = new Date(claimStart);
          const fin = new Date(claimEnd);
          while (cur <= fin) {
            const iso = cur.toISOString().slice(0, 10);
            autoRaw.push({
              lineItemId: `AUTO-DA-CLAIM-${claimId}-${iso}`,
              claimId: claimId ?? '',
              expenseType: 'DA',
              expenseSubType: destC,
              date: iso,
              description: `Daily Allowance — ${destC} (from submitted claim data)`,
              claimedAmount: rate,
              policyLimit: rate,
              eligibleAmount: rate,
              approvedAmount: 0,
              deductionAmount: 0,
              currency,
              receiptRequired: false,
              receiptUploaded: false,
              exceptionRequired: false,
            });
            cur.setDate(cur.getDate() + 1);
          }
          if (autoRaw.length > 0) effectiveRaw = autoRaw;
        }
      }
    }

    return effectiveRaw.map(li => {
      const date = li.date ?? '';
      if (!date) return li;

      // Approved-leave items are already correct — skip correction map entirely
      if (li.expenseSubType === 'Leave' || li.lineItemId?.startsWith('AUTO-DA-LV-')) return li;

      // Deliberately-zeroed "Not Applicable" categories (Delhi-NCR without an apartment stay,
      // ILO/Online batch, long-term stay ≥30 days, OB/Bench) are also already correct. The
      // flight-based re-correction below only knows how to derive a *country* from the
      // assignment/flights — it has no concept of "not applicable" — so letting these items
      // fall through silently revived a full India DA on every Delhi-NCR/ILO/long-term/OB day.
      // Bug fixed 2026-09-07: TADA-2026-00164 (Nikhil Pal, Gurgaon assignment, commuting from
      // home — no apartment stay) — the Delhi-NCR zero-out from the loop above was overwritten
      // right back to ₹950 India DA labeled "auto-corrected from PMS data" by this exact map.
      if (
        li.lineItemId?.startsWith('AUTO-DA-NCR-') ||
        li.lineItemId?.startsWith('AUTO-DA-ILO-') ||
        li.lineItemId?.startsWith('AUTO-DA-LT-') ||
        li.lineItemId?.startsWith('AUTO-DA-OB-')
      ) return li;

      // Find the assignment this DA day belongs to — check three cases:
      // 1. Date is within assignment range (regular on-site day)
      // 2. Date is the departure travel day (day before startDate — trainer flies to destination)
      // 3. Date is the return travel day (day after endDate — trainer flies back)
      let asgn = enrichedSummaryAssignments.find(a => a.startDate && a.endDate && date >= a.startDate && date <= a.endDate);
      let isDepartureDay = false;
      let isReturnDay = false;

      // Check return-day (immediately after a PRIOR assignment ends) BEFORE departure-day
      // (anywhere in a looser 6-day window before a LATER assignment starts). A date can satisfy
      // both when two assignments are close together — the tight, unambiguous "very next day
      // after this assignment ended" match must win over the loose "somewhere in the 6 days
      // before that OTHER assignment starts" match, or a genuine return day gets silently
      // reclassified as an early-arrival departure day for a trip that hasn't even started yet.
      // Bug fixed 2026-08-22: Nityanand Thakur EMP-760 — 11 Jul (the day after his Bangalore
      // assignment ended 10 Jul, and the day he actually departed India for the Philippines) was
      // being reclassified as a "departure day" for the Philippines assignment (starts 13 Jul,
      // within its 6-day-early window) instead of the return day for Bangalore, overwriting a
      // correct India ₹950 entry with an incorrect Philippines one.
      if (!asgn) {
        const byRet = enrichedSummaryAssignments.find(a => a.endDate && addD(a.endDate, 1) === date);
        if (byRet) { asgn = byRet; isReturnDay = true; }
      }
      if (!asgn) {
        // Check up to 6 days before startDate (matches the widened departure supplement range —
        // catches trainers who arrive several days early and stay locally before batch start)
        const byDep = enrichedSummaryAssignments.find(a => a.startDate && date >= addD(a.startDate, -6) && date < a.startDate);
        if (byDep) { asgn = byDep; isDepartureDay = true; }
      }
      if (!asgn) {
        // Overnight arrival check: date is 2-5 days after an assignment end, trainer arrived
        // on an overnight return flight — if arrival < 12:00, zero out DA. This rule is
        // specifically about arriving back HOME in India; it must NOT fire when the trainer
        // is actually continuing on to a DIFFERENT international destination (a new
        // assignment, not part of this claim). Bug fixed 2026-08-10: Ankur Kumar EMP-2485 —
        // this claim only covers his Dubai assignment (ends 16 Jul), but his 19 Jul flight
        // was Dubai→Nairobi (a new international assignment), not a return to India. The old
        // code blindly labeled it "Arrived India" and zeroed it out regardless of destination.
        const overnightAsgn = enrichedSummaryAssignments.find(a => a.endDate && date > addD(a.endDate, 1) && date <= addD(a.endDate, 5));
        if (overnightAsgn) {
          const arrFlight = activeFlights.find(f => {
            const ad = parseDT(String(f.arrival_date ?? ''));
            return ad === date;
          });
          if (arrFlight) {
            const arrToCountry = inferCountryFromCity(String(arrFlight.to_city ?? '').trim());
            const arrHHMM = String(arrFlight.arrival_time ?? '').substring(0, 5);
            if (arrToCountry === 'India' && arrHHMM && arrHHMM < '12:00') {
              return { ...li, claimedAmount: 0, policyLimit: 0, eligibleAmount: 0, approvedAmount: 0,
                description: `Not Eligible — Arrived India at ${arrHHMM} (before 12:00); no DA for arrival day` };
            }
            // Arrival is to a DIFFERENT country (not India) — this day belongs to a new
            // international assignment not covered by this claim; leave the item as-is
            // rather than mislabeling it "Arrived India".
          }
        }
        // If trainer has only a domestic India-to-India flight on this date, override to India ₹950
        const hasDomesticOnly = activeFlights.some(f => {
          const fd = parseDT(String(f.departure_date ?? ''));
          if (fd !== date) return false;
          const fromC = inferCountryFromCity(String(f.from_city ?? '').trim());
          const toC   = inferCountryFromCity(String(f.to_city ?? '').trim());
          return fromC === 'India' && toC === 'India';
        });
        if (hasDomesticOnly) {
          const { rate: ir, currency: ic } = getHrDaInfo('India');
          return { ...li, expenseSubType: 'India', currency: ic, policyLimit: ir, claimedAmount: ir,
            description: 'Daily Allowance — India (domestic travel day)' };
        }
        return li;
      }

      // City → country: city-inferred country wins over PMS-supplied "India"
      const cityCountry = asgn.city ? inferCountryFromCity(asgn.city) : '';
      const destCountry = (asgn.country === 'India' && cityCountry && cityCountry !== 'India')
        ? cityCountry
        : (asgn.country || cityCountry || 'India');
      // NOTE: do NOT early-return for India here — stored item may have wrong international country
      // and must be corrected to India below.

      let effectiveCountry = destCountry;

      const getAdjacentCountry = (a: typeof asgn) => {
        if (!a) return '';
        const c = a.city ? inferCountryFromCity(a.city) : '';
        return (a.country === 'India' && c && c !== 'India') ? c : (a.country || c || 'India');
      };

      // A date inside the departure window whose ONLY flight is a domestic India-to-India leg
      // (e.g. Bangalore->Delhi feeding a later international departure) must stay India DA — the
      // trainer hasn't left India yet on this date. Without this check, the destCountry/outbound
      // logic below re-derives the SAME international outbound flight for every date in the whole
      // -6-day window (it searches the window, not this specific date) and wrongly stamps a purely
      // domestic day with the destination country. Bug fixed 2026-08-31: TADA-2026-00112 (Abhishek
      // Soni, Asgn #266767) — 21-Aug (Bangalore->Delhi only) was corrected from India to Germany
      // because the Delhi->Zurich flight (22-Aug, arrives 06:20 <=17:00) was used as "the" outbound
      // leg for 21-Aug too.
      const dateHasDomesticOnly = isDepartureDay && activeFlights.some(f => {
        const fd = parseDT(String(f.departure_date ?? ''));
        if (fd !== date) return false;
        const fromC = inferCountryFromCity(String(f.from_city ?? '').trim());
        const toC   = inferCountryFromCity(String(f.to_city ?? '').trim());
        return fromC === 'India' && toC === 'India';
      });
      if (dateHasDomesticOnly) {
        effectiveCountry = 'India';
      } else if (isDepartureDay) {
        // Before flight-time check: if previous assignment was in the same country, trainer was
        // already in-country (consecutive same-country assignments) — give full international DA.
        const prevAsgn = enrichedNearbyAssignments
          .filter(a => a !== asgn && a.endDate && a.endDate < asgn!.startDate)
          .sort((a, b) => (b.endDate! > a.endDate! ? 1 : -1))[0] ?? null;
        if (getAdjacentCountry(prevAsgn) === destCountry) {
          // already in-country, no departure flight — full intl DA
        } else {
          // Trainer flies to destination.
          // Eligibility (dep < 17:00) is already guaranteed by the departure supplement.
          // Rate: arrival at destination ≤ 17:00 → destination country DA; else India DA.
          // Prefer the leg actually departing FROM India to international (not domestic connections).
          const outboundCandidates = activeFlights.filter(f => {
            const fd = parseDT(String(f.departure_date ?? ''));
            return fd ? fd >= addD(asgn!.startDate, -6) && fd < asgn!.startDate : false;
          });
          // Priority 1: latest candidate whose to_city matches the assignment's training city
          // (the actual final arrival leg, however many days before start it departed).
          const cityMatches = asgn!.city
            ? outboundCandidates.filter(f => String(f.to_city ?? '').trim().toLowerCase() === asgn!.city!.trim().toLowerCase())
            : [];
          const cityMatchPick = cityMatches.length === 0 ? null
            : cityMatches.reduce((latest, f) => {
                const ld = parseDT(String(latest.departure_date ?? '')) || '';
                const fd = parseDT(String(f.departure_date ?? '')) || '';
                return fd > ld ? f : latest;
              });
          const outbound = cityMatchPick ?? outboundCandidates.find(f => {
            const fromC = inferCountryFromCity(String(f.from_city ?? '').trim());
            const toC   = inferCountryFromCity(String(f.to_city ?? '').trim());
            return fromC === 'India' && toC !== 'India';
          }) ?? outboundCandidates.reduce((earliest, f) => {
            if (!earliest) return f;
            const et = String(earliest.departure_time ?? '').substring(0, 5);
            const ft = String(f.departure_time ?? '').substring(0, 5);
            return ft < et ? f : earliest;
          }, undefined as typeof activeFlights[number] | undefined);
          const arrAtDest = outbound ? String(outbound.arrival_time ?? '').substring(0, 5) : '';
          if (!arrAtDest || arrAtDest > '17:00') effectiveCountry = 'India';
        }

      } else if (isReturnDay) {
        // Before flight-time check: if next assignment is in the same country, trainer stays
        // in-country (consecutive same-country assignments) — give full international DA.
        const nextAsgn = enrichedNearbyAssignments
          .filter(a => a !== asgn && a.startDate && a.startDate > asgn!.endDate)
          .sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1))[0] ?? null;
        if (getAdjacentCountry(nextAsgn) === destCountry) {
          // stays in-country, no return flight — full intl DA
        } else {
          // Prefer the EARLIEST leg departing FROM the destination country (not a transit or
          // domestic leg) — .find() alone picks unsorted API array order, not chronological
          // order. Fixed 2026-08-11 (same class as the outbound-leg regression).
          const retFlightFromDestCandidates = activeFlights.filter(f => {
            const fd = parseDT(String(f.departure_date ?? ''));
            return fd ? fd >= asgn!.endDate && fd <= addD(asgn!.endDate, 5) && inferCountryFromCity(String(f.from_city ?? '').trim()) === destCountry : false;
          });
          const retFlightFromDest = retFlightFromDestCandidates.length === 0 ? null
            : retFlightFromDestCandidates.reduce((earliest, f) => {
                const ed = parseDT(String(earliest.departure_date ?? '')) || '';
                const fd = parseDT(String(f.departure_date ?? '')) || '';
                if (fd < ed) return f;
                if (fd > ed) return earliest;
                const et = String(earliest.departure_time ?? '').substring(0, 5);
                const ft = String(f.departure_time ?? '').substring(0, 5);
                return ft < et ? f : earliest;
              });
          const retFlight = retFlightFromDest ?? activeFlights
            .filter(f => {
              const fd = parseDT(String(f.departure_date ?? ''));
              return fd ? fd >= asgn!.endDate && fd <= addD(asgn!.endDate, 5) : false;
            })
            .reduce((earliest, f) => {
              if (!earliest) return f;
              const ed = parseDT(String(earliest.departure_date ?? '')) || '';
              const fd = parseDT(String(f.departure_date ?? '')) || '';
              if (fd < ed) return f;
              if (fd > ed) return earliest;
              const et = String(earliest.departure_time ?? '').substring(0, 5);
              const ft = String(f.departure_time ?? '').substring(0, 5);
              return ft < et ? f : earliest;
            }, undefined as typeof activeFlights[number] | undefined);

          // Only apply return-flight-based logic (same-day-India check, departure-time cutoff)
          // when the return flight ACTUALLY departs on the date being processed. The naive
          // "date === endDate + 1" match above only identifies ONE nominal date as isReturnDay
          // — but when the trainer holds over in the destination country for multiple days
          // before their real return flight (e.g. Ankur Kumar EMP-2485: Dubai batch ends 16
          // Jul, but the Dubai→Nairobi connecting flight doesn't depart until 19 Jul), that
          // single nominal date is NOT the flight's departure date. Wrongly applying the
          // return-flight's country/time logic to it corrupted 17 Jul back to India DA even
          // though the trainer was still physically in Dubai. If the return flight departs on
          // a LATER date, this is just a holding/gap day — keep full destCountry DA untouched.
          const retFd = retFlight ? parseDT(String(retFlight.departure_date ?? '')) : '';
          const isActualReturnFlightDay = !!retFlight && retFd === date;

          // Chase to the FINAL same-day connecting leg first — Bhavna Singh EMP-3505 flew
          // KL→Chennai (arrives 06:55) then Chennai→Delhi, her actual base (arrives 13:55,
          // after 12:00) — must evaluate the Delhi arrival, not the Chennai stopover.
          const finalRetLeg = isActualReturnFlightDay ? resolveFinalSameDayLeg(retFlight!) : null;
          const retToCountry = finalRetLeg ? inferCountryFromCity(String(finalRetLeg.to_city ?? '').trim()) : '';
          const retArrDate = finalRetLeg ? (parseDT(String(finalRetLeg.arrival_date ?? '')) || retFd) : '';
          // If this return leg lands in India the SAME calendar day (direct flight home, not
          // an overnight/multi-leg connection through a layover), the "arrival before 12:00 →
          // Not Eligible" rule takes priority over the departure-time cutoff below. Fixed
          // 2026-08-10: Magesh Kumar Palani EMP-3640 — KL→Chennai dep 05:45 (≥04:00 wrongly
          // gave full Malaysia DA), arrives Chennai 06:55 (before 12:00) — should be zero.
          const sameDayIndiaReturn = isActualReturnFlightDay && retToCountry === 'India' && retArrDate === retFd;
          if (!isActualReturnFlightDay) {
            // Holding/gap day before the real return flight — keep full destCountry DA
          } else if (sameDayIndiaReturn) {
            const retArrHHMM = String(finalRetLeg!.arrival_time ?? '').substring(0, 5);
            if (retArrHHMM && retArrHHMM <= '12:00') {
              return { ...li, claimedAmount: 0, policyLimit: 0, eligibleAmount: 0, approvedAmount: 0,
                description: `Not Eligible — Return Arrival Before 12:00 (arrives ${retArrHHMM})` };
            }
            // Eligible (arrives after 12:00) and lands in India same day — the FINAL leg's
            // arrival at the trainer's actual base is what decides the country, not how early
            // they left the destination country. Bug fixed 2026-08-31: Vaibhav Doshi EMP-2624,
            // TADA-2026-00138 — Singapore->Mumbai (dep 08:45) -> Mumbai->Udaipur (his actual
            // base, arrives 16:00) all on 29-Aug. The old rule only checked the Singapore
            // departure time (08:45, >=04:00) and kept Singapore DA, ignoring that the SECOND
            // leg (Mumbai->Udaipur) is what actually gets him home — arriving there after 12:00
            // means the day is his return-to-base day and should be India DA. Per explicit
            // instruction: once the final same-day leg lands at the trainer's base in India
            // after 12:00, that day is always India DA — no departure-time exception.
            effectiveCountry = 'India';
          } else if (retToCountry && retToCountry !== 'India' && retToCountry !== destCountry) {
            // The flight is heading to a DIFFERENT international destination, not returning
            // home to India — this day genuinely belongs to that new assignment, not this
            // one. Do not fabricate "India" just because departure was before 04:00. Bug
            // fixed 2026-08-10: Ankur Kumar EMP-2485 — Dubai→Nairobi is a continuation to a
            // new assignment, not a return to India; leave the stored/generated value as-is.
          } else {
            // Apply departure-time cutoff: check the DEPARTURE time FROM the destination country
            // (not the arrival time at some later leg/layover). Departs at/after 04:00 local →
            // trainer spent most of the day in destCountry → full destCountry DA. Departs before
            // 04:00 → India DA instead. Mirrors CreateTADABill.tsx's isReturn branch.
            const retDepTime = retFlight ? String(retFlight.departure_time ?? '').substring(0, 5) : '';
            if (!retDepTime || retDepTime < '04:00') effectiveCountry = 'India';
            // else: departs at/after 04:00 — keep destCountry (effectiveCountry already = destCountry)
          }
        }

      } else if (date === asgn.startDate) {
        // First day of assignment — only reduce DA if trainer flew IN on this exact date
        // (departed from India on startDate itself and arrived late). If they flew in the day
        // before, they are already at destination → full destC DA, no adjustment.
        // Pick the EARLIEST-departing leg on this date, not array order — a later same-day
        // connecting leg departing after 17:00 must not wrongly disqualify a trainer who
        // actually left home before 17:00 (same bug class as the departure-day supplement).
        const outboundSameDayCandidates = activeFlights.filter(f => parseDT(String(f.departure_date ?? '')) === asgn!.startDate);
        const outbound = outboundSameDayCandidates.reduce((earliest, f) => {
          if (!earliest) return f;
          const et = String(earliest.departure_time ?? '').substring(0, 5);
          const ft = String(f.departure_time ?? '').substring(0, 5);
          return ft < et ? f : earliest;
        }, undefined as typeof activeFlights[number] | undefined);
        if (outbound) {
          const depTimeOut2 = String(outbound.departure_time ?? '').substring(0, 5);
          if (depTimeOut2 && depTimeOut2 >= '17:00') effectiveCountry = 'India';
        }

      } else if (date === asgn.endDate) {
        // Last day of assignment — only reduce DA if return flight departs on this exact date
        // and trainer arrives home early. If flight is after endDate → full destC DA.
        // Pick the EARLIEST-departing leg on this date for the departure-time check, then chase
        // forward through same-day connecting legs to the FINAL arrival — not array order and
        // not just the first leg's own arrival (which may be an intermediate layover).
        const retSameDayCandidates = activeFlights.filter(f => parseDT(String(f.departure_date ?? '')) === asgn!.endDate);
        const retFlight = retSameDayCandidates.reduce((earliest, f) => {
          if (!earliest) return f;
          const et = String(earliest.departure_time ?? '').substring(0, 5);
          const ft = String(f.departure_time ?? '').substring(0, 5);
          return ft < et ? f : earliest;
        }, undefined as typeof activeFlights[number] | undefined);
        if (retFlight) {
          const finalRetLeg3 = resolveFinalSameDayLeg(retFlight);
          const retDepTime2 = String(retFlight.departure_time ?? '').substring(0, 5);
          const retArrTime2 = String(finalRetLeg3.arrival_time ?? '').substring(0, 5);
          // If departure is after 17:00, trainer was in destination country all day → full destC DA
          // Only downgrade to India if departure is early (≤ 17:00) AND arrives home before noon
          if (retDepTime2 && retDepTime2 <= '17:00' && retArrTime2 && retArrTime2 <= '12:00') effectiveCountry = 'India';
        }
      }
      // Mid-assignment days: full destCountry DA, no flight-time adjustment

      // Layover rule: on departure/return travel days, if there is a 4+ hr non-India layover → use that country's DA
      if (isDepartureDay || isReturnDay) {
        const layoverInfo = getLayoverCountry(date);
        if (layoverInfo) effectiveCountry = layoverInfo.country;
      }

      // Country/amount already correct, but the description text can still carry a stale
      // country name from an earlier computation of THIS SAME line item object (e.g. a country
      // fix landing after an HR override already independently matched the corrected value) --
      // clean that up too rather than skipping entirely just because expenseSubType matches.
      if (effectiveCountry === li.expenseSubType) {
        if (effectiveCountry !== 'India' && /india/i.test(li.description)) {
          return { ...li, description: li.description.replace(/india/gi, effectiveCountry) };
        }
        return li;
      }
      if (effectiveCountry === 'India') {
        // PMS confirms India — correct any wrong international DA stored in claim
        const { rate, currency } = getHrDaInfo('India');
        return { ...li, expenseSubType: 'India', currency, policyLimit: rate, claimedAmount: rate,
          description: `Daily Allowance — India (auto-corrected from PMS data)` };
      }
      const { rate, currency } = getHrDaInfo(effectiveCountry);
      return { ...li, expenseSubType: effectiveCountry, currency, policyLimit: rate, claimedAmount: rate, description: li.description.replace(/India/gi, effectiveCountry) };
    });
  }, [claimLineItems, enrichedSummaryAssignments, enrichedNearbyAssignments, summaryFlights, summaryLeaves, summaryAccom, claim, claimId]);

  // Dates already paid in other approved/paid claims for the same trainer
  const paidDaDates = useMemo(() => {
    if (!claim?.trainerId) return new Map<string, string>();
    return getPaidDADates(claim.trainerId, claimId ?? '');
  }, [claim, claimId]);

  // Travel/Cab and Misc line items already paid under the SAME ASSIGNMENT ID in another
  // paid claim — greyed out below exactly like DA, so re-opening or resubmitting the same
  // assignment can never double-pay a travel bill or misc expense either.
  const paidNonDaItems = useMemo(() => {
    const assignmentIds = (claim as unknown as { assignmentIds?: string[] })?.assignmentIds ?? [];
    return getPaidNonDaLineItems(assignmentIds, claimId ?? '');
  }, [claim, claimId, claimRefreshTick]);

  // Apply HR Admin overrides on top of auto-corrected DA items — keyed by DATE so the
  // override sticks to the correct calendar day even if the underlying PMS-computed array's
  // order/length shifts across reloads.
  const effectiveDaItemsFinal = useMemo(() =>
    correctedDaItems.map((li) => {
      const ov = li.date ? daHrOverrides[li.date] : undefined;
      if (!ov) return li;
      return { ...li, expenseSubType: ov.country, currency: ov.currency, policyLimit: ov.amount, claimedAmount: ov.amount };
    }),
  [correctedDaItems, daHrOverrides]);

  // Apply HR travel overrides — keyed by lineItemId so the override sticks to the correct
  // record even if the sorted render order shifts across reloads.
  // approvedAmount is also overridden so bestAmt() always picks the HR-edited value,
  // not a stale stored approvedAmount from a previous action.
  const effectiveTravelItemsFinal = useMemo(() => {
    const raw = claimLineItems.filter(li => li.expenseType === 'TA' || li.expenseType === 'Cab');
    const sorted = raw.slice().sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    return sorted.map((li) => {
      const ov = taHrOverrides[li.lineItemId];
      if (!ov) return li;
      return { ...li, currency: ov.currency, claimedAmount: ov.amount, eligibleAmount: ov.amount, approvedAmount: ov.amount };
    });
  }, [claimLineItems, taHrOverrides]);

  // Apply HR misc overrides — keyed by lineItemId so the override sticks to the correct
  // record even if the sorted render order shifts across reloads.
  // approvedAmount is also overridden so bestAmt() always picks the HR-edited value.
  const effectiveMiscItemsFinal = useMemo(() => {
    const raw = claimLineItems.filter(li => li.expenseType === 'Other');
    const sorted = raw.slice().sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    return sorted.map((li) => {
      const ov = miscHrOverrides[li.lineItemId];
      if (!ov) return li;
      return { ...li, currency: ov.currency, claimedAmount: ov.amount, eligibleAmount: ov.amount, approvedAmount: ov.amount };
    });
  }, [claimLineItems, miscHrOverrides]);

  // Best available amount for a line item (some stored claims have claimedAmount=0, eligibleAmount=actual)
  const bestAmt = (li: ClaimLineItem) => Math.max(li.claimedAmount ?? 0, li.eligibleAmount ?? 0, li.approvedAmount ?? 0);

  // Matches getPaidNonDaLineItems' key exactly (date|expenseType|amount) so a Travel/Cab or
  // Misc item already paid under this same assignment in another claim is recognized here too.
  const nonDaPaidKey = (li: ClaimLineItem) => `${li.date}|${li.expenseType}|${bestAmt(li)}`;
  const isPaidElsewhere = (li: ClaimLineItem) => paidNonDaItems.has(nonDaPaidKey(li));

  // NOTE: an earlier version of this file had an automatic "self-healing" effect here that
  // silently rewrote a decided claim's stored line items to match the live PMS recompute on
  // every page load. It was reverted the same day it shipped: it overwrote Aditi Diwan's
  // TADA-2026-00075 (a Paid claim) from its correct, manually-verified 24+25 Aug data down to
  // 23+24 Aug, because the live recompute for that claim is itself sensitive to PMS/flight data
  // that can shift over time — exactly the "wrong calculation" risk this whole codebase has been
  // fighting all session. Once a claim is Paid, its stored record is a historical fact of what
  // was actually disbursed and must never be silently rewritten by a live recompute, no matter
  // how well-intentioned. Fixing staleness safely requires either (a) a human reviewing and
  // confirming the correction (the manual-fix pattern used throughout this session), or (b) only
  // ever refreshing stored data at the moment of a NEW HR decision (see persistAction's approve/
  // partial-approve refresh below), never on a passive page view of an already-decided claim.

  // Derive TA/Misc totals directly from the effective arrays (which already have
  // HR overrides applied as claimedAmount). This is the single source of truth —
  // no separate idx-remapping that could fall out of sync. Items already paid under the same
  // assignment in another claim are excluded here too, same as already-paid DA days.
  const liveTATotalINR = effectiveTravelItemsFinal.reduce(
    (s, li) => isPaidElsewhere(li) ? s : s + toINR(li.claimedAmount ?? 0, li.currency ?? 'INR'), 0
  );

  const liveMiscTotalINR = effectiveMiscItemsFinal.reduce(
    (s, li) => isPaidElsewhere(li) ? s : s + toINR(li.claimedAmount ?? 0, li.currency ?? 'INR'), 0
  );

  // Grand total in INR — DA (multi-currency) + TA/Cab + Lodging + Misc, all converted to INR
  // Already-paid DA dates (greyed out) are excluded from the DA total so they don't inflate Net Payable.
  const liveGrandTotalINR = (() => {
    const unpaidDaItemsFinal = effectiveDaItemsFinal.filter(li => !paidDaDates.has(li.date ?? ''));
    const daINR = unpaidDaItemsFinal.reduce((s, li) => s + toINR(li.claimedAmount, li.currency), 0);
    const lodgingINR = claimLineItems
      .filter(li => (li.expenseType as string) === 'Lodging' || (li.expenseType as string) === 'Hotel')
      .reduce((s, li) => s + toINR(bestAmt(li), li.currency ?? 'INR'), 0);
    return daINR + liveTATotalINR + liveMiscTotalINR + lodgingINR;
  })();

  const liveNetPayableINR = Math.max(0, liveGrandTotalINR - advanceAdjusted);
  const liveRecoverableINR = Math.max(0, advanceAdjusted - liveGrandTotalINR);
  // Whether the live recompute actually has data to work with, as opposed to `liveGrandTotalINR
  // > 0` — a claim whose DA is fully deduped against another claim's already-paid days AND whose
  // travel bills HR has legitimately zeroed out (both real, intentional cases, not missing data)
  // can have a genuinely correct live total of exactly 0. Treating "> 0" as the readiness check
  // made the header/Amount Summary fall back to the stale stored total instead of showing that
  // correct 0. Bug fixed 2026-08-21: TADA-2026-00006 (Akshay Kumar) -- DA already paid via
  // TADA-2026-00030, all 4 travel bills HR-zeroed as duplicates of the same trip, Final Payment
  // Summary correctly showed Rs.0, but Amount Summary/header still showed the stale Rs.12,372.
  const liveDataReady = effectiveDaItemsFinal.length > 0 || effectiveTravelItemsFinal.length > 0 || effectiveMiscItemsFinal.length > 0;

  // A claim sitting at status 'Paid' and UNTOUCHED this visit must show the exact historical
  // figures it was actually disbursed at on every read-only display, never a fresh live
  // recompute. toINR's Paid+fxRatesSnapshot guard freezes the FX conversion, but
  // liveGrandTotalINR also re-derives DA/travel/misc from today's PMS/flight data — if any of
  // THAT drifted (or the claim predates fxRatesSnapshot being captured at all), the live figure
  // can differ from what was paid even though nothing about the claim itself changed. Used only
  // for DISPLAY (Amount Summary, the header banners) — deliberately NOT substituted for the
  // plain `liveDataReady` above wherever it feeds a value HR is about to re-save (e.g.
  // applyAlreadyPaidDeduction), since those need the live recompute to self-heal a stale stored
  // figure regardless of the claim's current status. Bug fixed 2026-09-08: TADA-2026-00054 —
  // actually paid ₹44,926, later showed ₹44,313 on a plain reopen (no edits made) purely
  // because today's live rates differ from the day it was paid.
  //
  // BUT: the DA/TA/Misc row Edit buttons are not gated by claim status — HR can correct a row on
  // a claim that is still literally 'Paid' without clicking Reopen first, and that edit persists
  // immediately (persistHrOverrideField), not just on a later Approve click. Freezing the display
  // unconditionally on status would then hide the very correction HR just made. Re-enable the
  // live recompute the moment HR touches anything this visit (paidClaimEditedThisSession), so an
  // in-progress adjustment to an already-paid bill is reflected, and only fall back to frozen
  // historical figures for a claim nobody has touched.
  const showLiveAmounts = liveDataReady && (claim?.status !== 'Paid' || paidClaimEditedThisSession);

  // Same frozen-rate logic as toINR above, exposed here (now that `claim` exists) for the two
  // spots that display the RATE NUMBER itself (e.g. "1 USD = ₹96"), not just a converted amount —
  // those must stay consistent with the frozen conversions once a claim is Paid too.
  const displayRates = (claim?.status === 'Paid' && (claim as unknown as { fxRatesSnapshot?: Record<string, number> })?.fxRatesSnapshot)
    || liveRates;

  const claimAttachments = useMemo(
    () => claimLineItems.filter(li => li.receiptData || li.receiptUploaded),
    [claimLineItems]
  );

  const claimHistory = useMemo(
    () => mockStatusHistory.filter((h) => h.claimId === claimId),
    [claimId]
  );

  const availableActions = useMemo(
    () => (claim ? getAvailableActions(currentUser.role, claim.status) : []),
    [claim, currentUser.role]
  );

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const persistAction = (action: ActionConfig, reason: string) => {
    if (!claim || !claimId) return;
    const base = getClaims().find((c) => c.claimId === claimId);
    if (!base) return;

    const now = new Date().toISOString();
    // Use live computed total (multi-currency converted to INR) when available
    const computedTotal = liveDataReady ? liveGrandTotalINR : (base.totalClaimedAmount ?? 0);
    // advanceAdjusted reflects whichever advance checkboxes are CURRENTLY ticked in the UI,
    // which start unchecked on every page load. Only Approve/Partial-Approve are actions
    // that are meant to (re)record which advances were used for this decision — every other
    // action (Reopen, Reject, Hold, Send Clarification, etc.) must preserve the previously
    // recorded advanceAdjusted, or it silently gets wiped to 0 whenever HR takes any action
    // without having re-ticked the same boxes first. Bug fixed 2026-08-12: Ankur Kumar
    // TADA-2026-80180 and others lost their recorded advance adjustment on Reopen.
    const isAdvanceRecordingAction = action.key === 'approve' || action.key === 'partial-approve';
    const effectiveAdvance = isAdvanceRecordingAction ? advanceAdjusted : (base.advanceAdjusted ?? 0);
    // Already-Paid-for-this-assignment deduction (HR reopen safeguard, set via the "Already
    // Paid — Same Assignment ID" panel) must also come off the amount actually approved/paid,
    // not just the on-screen display, or reopening a paid bill would still let it be re-approved
    // and re-paid in full.
    const alreadyPaidDed = (base as unknown as { alreadyPaidDeduction?: number }).alreadyPaidDeduction ?? 0;
    const computedNet = computedTotal - effectiveAdvance - (base.deductionAmount ?? 0) - (base.recoverableAmount ?? 0) - alreadyPaidDed;

    // If HR is RE-approving a claim that already had a real prior decision (e.g. editing DA rows
    // down/up after an earlier Approve), and the amount is actually changing, record the OLD
    // amount as its own approval-history entry before it gets overwritten below. Otherwise the
    // earlier decision just silently disappears from view — Payment Processing (and this page)
    // only ever show the single current netPayable/approvedAmount, with no trace of what it used
    // to be. Bug fixed 2026-08-27: Prem Sharma EMP-1563, TADA-2026-00055 — HR zeroed 5 of 6 DA
    // days via override and re-approved; the claim's original ~15,900 approval vanished with no
    // record, looking exactly like money had been silently removed.
    const wasAlreadyDecided = isAdvanceRecordingAction &&
      (base.status === 'Approved' || base.status === 'Partially Approved') &&
      base.netPayable != null;
    if (wasAlreadyDecided && Math.round(base.netPayable!) !== Math.round(computedNet)) {
      fetch('/api/turso?type=approval-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvalId: `appr_${Date.now()}`,
          claimId,
          billNo: base.billNo,
          trainerName: base.trainerName,
          previousAmount: base.netPayable,
          previousApprovedAmount: base.approvedAmount ?? null,
          newAmount: computedNet,
          changedBy: currentUser.name,
          approvedAt: now,
        }),
      }).catch(() => { /* best-effort — never block the actual approval on this */ });
    }

    let patch: Partial<import('../types').ClaimHeader> = {
      lastActionAt: now,
      advanceAdjusted: effectiveAdvance,
      netPayable: computedNet,
      totalClaimedAmount: computedTotal,
      // Freeze today's XE rates on the claim record at the moment of decision — once this claim
      // reaches Paid, its DA/Travel/Misc INR breakup must keep using THIS rate forever, not
      // whatever XE happens to return the next time HR reopens it from Payment Processing.
      ...(isAdvanceRecordingAction ? { fxRatesSnapshot: liveRates } : {}),
    };

    // On Approve/Partial-Approve, replace the claim's STORED DA line items with the current
    // live-corrected set (HR overrides applied, already-paid-elsewhere days excluded) — not just
    // update the numeric totals. Without this, a claim's original-submission DA line items stay
    // frozen forever even after a policy fix changes what the live recompute produces, so a LATER
    // sibling claim's "already paid" dedup check (which reads stored line items, not a live
    // recompute) keeps trusting stale data indefinitely. Bug fixed 2026-08-27: Prem Sharma
    // EMP-1563, assignment gap 264659->264834 — TADA-2026-00057's stored line items still had a
    // stale 09-Aug entry from before a fix changed its live table to correctly start at 10-Aug;
    // TADA-2026-00055's own (correct) 09-Aug gap-fill day was wrongly deduped against that stale
    // entry, so 09-Aug ended up paid nowhere. Persisting the live set here at Approve time keeps
    // stored data from silently drifting out of sync with what HR is actually deciding.
    if (isAdvanceRecordingAction) {
      const unpaidDaItemsForSave = effectiveDaItemsFinal.filter(li => !paidDaDates.has(li.date ?? ''));
      const nonDaLineItems = (base.lineItems ?? []).filter(li => li.expenseType !== 'DA');
      patch = { ...patch, lineItems: [...nonDaLineItems, ...unpaidDaItemsForSave] };
    }

    switch (action.key) {
      case 'send-clarification':
        patch = { ...patch, status: 'Clarification Required', pendingWith: 'Trainer', adminRemark: reason };
        break;
      case 'approve':
        patch = { ...patch, status: 'Approved', pendingWith: 'Finance', adminRemark: reason, approvedAmount: computedTotal };
        break;
      case 'partial-approve':
        patch = { ...patch, status: 'Partially Approved', pendingWith: 'Finance', adminRemark: reason };
        break;
      case 'reject':
        patch = { ...patch, status: 'Rejected', pendingWith: 'Trainer', adminRemark: reason };
        break;
      case 'hold':
        patch = { ...patch, status: 'On Hold', pendingWith: 'HR/Admin', adminRemark: reason };
        break;
      case 'mark-paid':
        patch = { ...patch, status: 'Paid', pendingWith: undefined, adminRemark: reason };
        break;
      case 'reopen':
        patch = { ...patch, status: 'Submitted', pendingWith: 'HR/Admin', adminRemark: reason };
        break;
      case 'cancel':
        patch = { ...patch, status: 'Cancelled', pendingWith: undefined, adminRemark: reason };
        break;
      case 'respond':
        patch = { ...patch, status: 'Resubmitted', pendingWith: 'HR/Admin', adminRemark: reason };
        break;
      case 'start-review-again':
        patch = { ...patch, status: 'Under Review', pendingWith: 'HR/Admin' };
        break;
    }

    // Notify Koenig RMS of the HR approval (api_id=343) — marks the RMS TA Bill record
    // HR-approved and links this claim's flight Trip IDs to it. Strictly additive/
    // fire-and-forget: only fires when this claim has an rmsTABillId (i.e. it was
    // created via the newer Create TA Bill integration) and at least one active flight
    // Trip ID is known; never awaited and never blocks/alters the existing HR action.
    if (action.key === 'approve' || action.key === 'partial-approve') {
      const tabillId = (base as unknown as { rmsTABillId?: number }).rmsTABillId;
      if (tabillId) {
        // Only this claim's OWN travel/return flights — not every active flight the
        // trainer has ever had in PMS. Scoped to the assignment(s) on this claim, chasing
        // through connecting legs the same way the DA and RMS-period logic already does,
        // rather than any date range the trainer picked.
        const addDLocal = (iso: string, n: number) => { if (!iso) return ''; const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
        const claimAsgnIds = new Set((base.assignmentIds ?? []).map(String));
        const claimAsgns = enrichedSummaryAssignments
          .filter(a => a.assignmentId && claimAsgnIds.has(String(a.assignmentId)))
          .slice()
          .sort((a, b) => (a.startDate || '') < (b.startDate || '') ? -1 : 1);
        const activeFlightsForTrip = summaryFlights.filter(f => f.Is_cancelled !== 'Yes');
        const tripIdSet = new Set<string>();
        const addTripId = (f: typeof activeFlightsForTrip[number] | undefined) => {
          if (f?.trip_ID != null) tripIdSet.add(String(f.trip_ID));
        };

        const firstAsgn = claimAsgns[0];
        const lastAsgn = claimAsgns[claimAsgns.length - 1];

        if (firstAsgn?.startDate) {
          const outboundCandidates = activeFlightsForTrip.filter(f => {
            const fd = parseDT(String(f.departure_date ?? ''));
            return fd ? fd >= addDLocal(firstAsgn.startDate!, -6) && fd <= firstAsgn.startDate! : false;
          });
          let outbound = outboundCandidates.length === 0 ? undefined
            : outboundCandidates.reduce((earliest, f) => {
                const ed = parseDT(String(earliest.departure_date ?? '')) || '';
                const fd = parseDT(String(f.departure_date ?? '')) || '';
                if (fd < ed) return f;
                if (fd > ed) return earliest;
                return String(f.departure_time ?? '').substring(0, 5) < String(earliest.departure_time ?? '').substring(0, 5) ? f : earliest;
              });
          for (let hop = 0; hop < 5 && outbound; hop++) {
            addTripId(outbound);
            const curFromCity = String(outbound.from_city ?? '').trim().toLowerCase();
            const curDepDate = parseDT(String(outbound.departure_date ?? ''));
            const prevLeg = activeFlightsForTrip.find(f => {
              if (f === outbound) return false;
              const toCity = String(f.to_city ?? '').trim().toLowerCase();
              const fd = parseDT(String(f.departure_date ?? ''));
              return !!toCity && toCity === curFromCity && !!fd && fd <= curDepDate && fd >= addDLocal(curDepDate, -2);
            });
            if (!prevLeg) break;
            outbound = prevLeg;
          }
        }

        if (lastAsgn?.endDate) {
          const cityCountryLast = lastAsgn.city ? inferCountryFromCity(lastAsgn.city) : '';
          const destCountryLast = (lastAsgn.country === 'India' && cityCountryLast && cityCountryLast !== 'India') ? cityCountryLast : (lastAsgn.country || cityCountryLast || '');
          // Widened from +5 to +45 days — a return flight is often rebooked (original ticket
          // cancelled, a later one issued) well past the assignment's original end date. Bug
          // fixed 2026-08-21: Kshitiz Raghuvanshi EMP-2707, TABill 82907 — assignment ended 31
          // Jul, but the return was cancelled and rebooked to 15 Aug; the +5 day window missed
          // the return leg entirely, so no TripID for it was ever sent to RMS's Approve API.
          const returnCandidates = activeFlightsForTrip.filter(f => {
            const fd = parseDT(String(f.departure_date ?? ''));
            return fd ? fd >= lastAsgn.endDate! && fd <= addDLocal(lastAsgn.endDate!, 45)
              && (!destCountryLast || inferCountryFromCity(String(f.from_city ?? '').trim()) === destCountryLast) : false;
          });
          let returnLeg = returnCandidates.length === 0 ? undefined
            : returnCandidates.reduce((earliest, f) => {
                const ed = parseDT(String(earliest.departure_date ?? '')) || '';
                const fd = parseDT(String(f.departure_date ?? '')) || '';
                if (fd < ed) return f;
                if (fd > ed) return earliest;
                return String(f.departure_time ?? '').substring(0, 5) < String(earliest.departure_time ?? '').substring(0, 5) ? f : earliest;
              });
          for (let hop = 0; hop < 5 && returnLeg; hop++) {
            addTripId(returnLeg);
            const curToCity = String(returnLeg.to_city ?? '').trim().toLowerCase();
            const curCountry = inferCountryFromCity(String(returnLeg.to_city ?? '').trim());
            if (curCountry === 'India') break;
            const curArrDate = parseDT(String(returnLeg.arrival_date ?? '')) || parseDT(String(returnLeg.departure_date ?? ''));
            const nextLeg = activeFlightsForTrip.find(f => {
              if (f === returnLeg) return false;
              const fromCity = String(f.from_city ?? '').trim().toLowerCase();
              const fd = parseDT(String(f.departure_date ?? ''));
              return !!fromCity && fromCity === curToCity && !!fd && fd >= curArrDate && fd <= addDLocal(curArrDate, 2);
            });
            if (!nextLeg) break;
            returnLeg = nextLeg;
          }
        }

        const tripIds = Array.from(tripIdSet).join(',');
        if (tripIds) {
          fetch('/api/turso?type=hr-approve-tabill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              TABillID: tabillId,
              TripIDs: tripIds,
              IsHRApproved: 1,
              HRRemark: reason || '',
            }),
          }).catch(() => { /* additive only — never blocks the existing HR action */ });
        }
      }
    }

    // Record advance recovery when claim is approved/partially-approved.
    // Priority: use checked advances from UI; fallback to base.advanceItems (set at submit time).
    // claimAmount = HR-approved amount; if not set, total claimed amount.
    if (action.key === 'approve' || action.key === 'partial-approve') {
      const claimAmount = (base.approvedAmount && base.approvedAmount > 0)
        ? base.approvedAmount
        : (base.totalClaimedAmount ?? 0);

      // Only use advances explicitly checked by HR Admin
      const advSources = liveAdvances.filter(i => checkedAdvances.has(i.key));

      if (claimAmount > 0 && advSources.length > 0) {
        const totalAmt = advSources.reduce((s, i) => s + i.amount, 0);
        const recoveries = advSources
          .map(i => ({
            advanceKey: i.key,
            claimAmountUsed: totalAmt > 0 ? Math.round((i.amount / totalAmt) * claimAmount) : 0,
            // Store the advance's own original amount/currency/date so it can be displayed
            // correctly (e.g. AED, not assumed INR) without fragile parsing of advanceKey.
            originalAmount: i.amount,
            currency: i.currency,
            date: i.date,
          }))
          .filter(r => r.claimAmountUsed > 0);

        if (recoveries.length > 0) {
          const kept = (base.advanceRecoveries ?? []).filter(
            r => !recoveries.some(nr => nr.advanceKey === r.advanceKey)
          );
          saveClaim({ ...base, ...patch, advanceRecoveries: [...kept, ...recoveries] });
          return;
        }
      }
    }

    saveClaim({ ...base, ...patch });
  };

  // Best email for the trainer — PMS-resolved takes priority, stored claim email as fallback
  const effectiveTrainerEmail = resolvedTrainerEmail || (claim as unknown as { trainerEmail?: string })?.trainerEmail || '';

  // Fire HR action email — never blocks the action itself, but must never fail silently
  // either. approvedAmount is always sent (never omitted) so the trainer always sees
  // exactly what HR Admin approved for this action.
  const fireActionEmail = async (actionKey: string, remarks?: string, overrideApprovedAmount?: number) => {
    if (!claim) return;
    let email = effectiveTrainerEmail;
    if (!email) {
      // The background PMS lookup (resolvedTrainerEmail) may not have completed yet by
      // the time HR Admin clicks an action — retry it synchronously right here, once,
      // before giving up. Previously an unresolved email at click-time meant the
      // notification was skipped with only a console.warn — invisible to HR Admin, who
      // saw the same "saved successfully" toast either way.
      const trainerId = String((claim as unknown as { trainerId?: string }).trainerId ?? '');
      const empCode = trainerId.replace(/^EMP-/i, '').trim();
      if (empCode) {
        try {
          const r = await fetch(`/api/employee?empCode=${encodeURIComponent(empCode)}`);
          const d = await r.json();
          const emp = (d.employee ?? {}) as Record<string, unknown>;
          email = String(emp.email_address ?? emp.EmailAddress ?? emp.Email ?? emp.email ?? '').trim();
        } catch { /* fall through to the warning below */ }
      }
    }
    if (!email) {
      console.warn('[TA/DA] No trainer email available — skipping notification for', actionKey);
      showToast(`⚠️ Action saved, but no email could be sent — no email address on record for ${claim.trainerName}. Please notify them manually.`);
      return;
    }
    const sent = await sendActionEmail({
      toEmail: email,
      toName: claim.trainerName,
      actionKey,
      claimId: claim.claimId,
      billNo: claim.billNo,
      remarks: remarks || undefined,
      hrName: 'HR Admin',
      approvedAmount: overrideApprovedAmount ?? (liveDataReady ? liveGrandTotalINR : (claim.approvedAmount ?? 0)),
      currency: 'INR',
    });
    if (!sent) {
      showToast(`⚠️ Action saved, but the notification email to ${claim.trainerName} failed to send. Please notify them manually.`);
    }
  };

  const handleActionConfirm = (action: ActionConfig, reason: string) => {
    persistAction(action, reason);
    showToast(`${action.label} — saved successfully.`);
    // Always fire email for every confirmed action
    fireActionEmail(action.key, reason);

    if (action.key !== 'start-review-again') {
      setTimeout(() => navigate(-1), 1500);
    }
  };

  const handleActionClick = (action: ActionConfig) => {
    if (action.needsModal) {
      setActiveModal(action);
    } else {
      if (action.key === 'edit') {
        navigate(`/claims/${claimId}/edit`);
      } else if (action.key === 'start-review') {
        if (claim && claimId) {
          const base = getClaims().find((c) => c.claimId === claimId);
          if (base) saveClaim({ ...base, status: 'Under Review', pendingWith: 'HR/Admin', lastActionAt: new Date().toISOString() });
          fireActionEmail('start-review');
        }
        navigate(`/claims/${claimId}/review`);
      } else if (action.key === 'start-review-again') {
        if (claim && claimId) {
          const base = getClaims().find((c) => c.claimId === claimId);
          if (base) saveClaim({ ...base, status: 'Under Review', pendingWith: 'HR/Admin', lastActionAt: new Date().toISOString() });
          fireActionEmail('start-review-again');
        }
        showToast('Review started — claim is now Under Review.');
      }
    }
  };

  if (!claim) return <NotFound onBack={() => navigate(-1)} />;

  // Adapt status history to ClaimTimeline expected format
  const adaptedHistory = claimHistory.map((h) => ({
    historyId: h.historyId,
    claimId: h.claimId,
    fromStatus: (h.fromStatus ?? null) as ClaimStatus | null,
    toStatus: h.toStatus as ClaimStatus,
    changedBy: h.changedBy,
    changedByRole: (h.changedByRole ?? 'Trainer') as UserRole,
    changedAt: h.changedAt,
    remarks: h.remarks,
  }));

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* ── Back button ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors focus:outline-none"
        >
          <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to My Bills
        </button>
      </div>

      {/* ── Header summary card ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-gray-900">{claim.billNo}</h2>
              {claim.rmsTABillId && (
                <span className="text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded px-2 py-0.5">RMS TABillID: {claim.rmsTABillId}</span>
              )}
              <StatusBadge status={claim.status} />
              {claim.pendingWith && <PendingBadge pendingWith={claim.pendingWith} />}
            </div>

            <p className="text-sm text-gray-500">
              {claim.clientName}
              {claim.baseCity ? ` — ${claim.baseCity}` : ''}
              {(claim.destinationCities[0] ?? "") && (claim.destinationCities[0] ?? "") !== 'India' ? `, ${(claim.destinationCities[0] ?? "")}` : ''}
            </p>

            <RiskFlags claim={claim} />
          </div>

          {/* Amount summary strip */}
          <div className="flex flex-wrap gap-4 text-sm">
            {/* "Claimed" always shows the STORED original submission amount — matching "View
                My Bills" exactly — since that figure represents what the trainer actually
                submitted and must never drift on its own. "Approved" and "Net Payable" here
                use the same live-first logic as the Amount Summary card and Final Payment
                Summary box below: once HR edits individual DA/Travel/Misc amounts via the Edit
                buttons on this page, those overrides aren't written back to the claim record
                until Approve/Partial-Approve is actually clicked, so this header must reflect
                them live too — otherwise it contradicts the very sections just below it. Bug
                fixed 2026-08-20: TADA-2026-00004 (Wasiuddin) — after fixing Amount Summary/
                Final Payment Summary to show the live 2,550, this header still said 3,659. */}
            <div className="text-center">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Claimed</div>
              <div className="font-semibold text-gray-800">
                ₹{Math.round(claim.totalClaimedAmount ?? 0).toLocaleString('en-IN')}
              </div>
            </div>
            {claim.approvedAmount !== null && (
              <div className="text-center">
                <div className="text-xs text-gray-400 uppercase tracking-wide">Approved</div>
                <div className="font-semibold text-green-700">
                  ₹{Math.round(showLiveAmounts ? liveGrandTotalINR - alreadyPaidDeduction : (claim.approvedAmount && claim.approvedAmount > 0 ? claim.approvedAmount : (claim.totalClaimedAmount ?? 0))).toLocaleString('en-IN')}
                </div>
              </div>
            )}
            {(claim.deductionAmount ?? 0) > 0 && (
              <div className="text-center">
                <div className="text-xs text-gray-400 uppercase tracking-wide">Deduction</div>
                <div className="font-semibold text-red-600">
                  -₹{Math.round(claim.deductionAmount ?? 0).toLocaleString('en-IN')}
                </div>
              </div>
            )}
            {claim.netPayable !== null && (
              <div className="text-center">
                <div className="text-xs text-gray-400 uppercase tracking-wide">Net Payable</div>
                <div className="font-bold text-blue-700">
                  {/* Must reflect the "Already Paid — Same Assignment ID" deduction too — this
                      header is the FIRST number HR sees, and it previously showed the full
                      pre-deduction amount even after the Amount Summary card, Net Payable
                      banner, and Live Final Summary strip below it were all already correctly
                      showing the reduced figure. Only subtract in the live-computed branch —
                      the stored claim.netPayable fallback is already net-of-deduction once a
                      claim has actually been Approved (persistAction's computedNet already
                      subtracts it), so applying it again there would double-count. */}
                  ₹{Math.round(showLiveAmounts ? liveNetPayableINR - alreadyPaidDeduction : (claim.netPayable ?? claim.totalClaimedAmount ?? 0)).toLocaleString('en-IN')}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab navigation ── */}
      <div className="bg-white border-b border-gray-200 px-6">
        <nav className="flex gap-0 overflow-x-auto -mb-px" aria-label="Claim detail tabs">
          {[
            ...TABS,
            ...(claim.status === 'Paid' ? [{ id: 'payment' as TabId, label: '💳 Payment Record' }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                focus:outline-none
                ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 px-6 py-6 pb-32">
        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Two-column info grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Trainer info */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Trainer Info</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <InfoRow label="Trainer Name" value={claim.trainerName} />
                  <InfoRow label="Currency" value={claim.currency ?? 'INR'} />
                  <InfoRow label="Submitted" value={claim.submittedAt ? new Date(claim.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not submitted'} />
                  <InfoRow label="Aging" value={`${claim.agingDays ?? 0} day(s)`} />
                  <InfoRow label="Base City" value={claim.baseCity} />
                  <InfoRow label="Country" value={(claim.destinationCities[0] ?? "")} />
                </dl>
              </div>

              {/* Assignment info */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Assignment Info</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <InfoRow label="Client" value={claim.clientName} />
                  <InfoRow label="Location" value={claim.trainingLocation} />
                  <InfoRow label="Assignment(s)" value={(claim.assignmentIds ?? []).join(', ')} />
                  <InfoRow
                    label="International"
                    value={
                      (claim.destinationCities.some(c => c !== "India")) ? (
                        <span className="text-blue-600 font-medium">Yes</span>
                      ) : (
                        <span className="text-gray-500">No</span>
                      )
                    }
                  />
                  {/* Date range */}
                  {(claim as unknown as { claimStartDate?: string }).claimStartDate && (
                    <InfoRow
                      label="Period"
                      value={`${new Date((claim as unknown as { claimStartDate: string }).claimStartDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} → ${new Date((claim as unknown as { claimEndDate?: string }).claimEndDate ?? '').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                    />
                  )}
                  {/* Course name from PMS (available after summaryAssignments loads) */}
                  {summaryAssignments[0]?.courseName && (
                    <InfoRow label="Course" value={summaryAssignments[0].courseName} />
                  )}
                  {summaryAssignments[0]?.batchId && (
                    <InfoRow label="Batch ID" value={summaryAssignments[0].batchId} />
                  )}
                  {summaryAssignments[0]?.deliveryMode && (
                    <InfoRow label="Mode" value={summaryAssignments[0].deliveryMode} />
                  )}
                  {summaryAssignments[0]?.city && (
                    <InfoRow label="City" value={summaryAssignments[0].city} />
                  )}
                  {(claim as unknown as { trainerId?: string }).trainerId && (
                    <InfoRow label="Emp Code" value={(claim as unknown as { trainerId: string }).trainerId.replace(/^EMP-/i, '')} />
                  )}
                </dl>
                {claim.adminRemark && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs font-medium text-amber-700 mb-1">Admin Remark</p>
                    <p className="text-sm text-amber-900">{claim.adminRemark}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Status timeline */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Status History</h3>
              <ClaimTimeline
                statusHistory={adaptedHistory}
                currentStatus={claim.status as ClaimStatus}
              />
            </div>

            {/* Already Paid (same assignment, other claims) — must be seen and adjustable BEFORE
                Amount Summary, so HR reopening a paid bill can't miss it and re-approve the
                trainer's full claimed amount a second time for work already disbursed. */}
            {assignmentAlreadyPaidClaims.length > 0 && (
              <div className="bg-red-50 rounded-xl border border-red-200 p-5">
                <h3 className="text-sm font-semibold text-red-800 mb-1 uppercase tracking-wide flex items-center gap-2">
                  ⚠️ Already Paid — Same Assignment ID
                </h3>
                <p className="text-xs text-red-700 mb-3">
                  Found {assignmentAlreadyPaidClaims.length} other Paid claim{assignmentAlreadyPaidClaims.length !== 1 ? 's' : ''} for
                  the same assignment ID under this trainer. Adjust the deduction below before approving, to avoid paying twice for the same work.
                </p>
                <div className="space-y-1.5 mb-3">
                  {assignmentAlreadyPaidClaims.map(c => (
                    <div key={c.claimId} className="flex items-center justify-between text-xs bg-white border border-red-100 rounded-lg px-3 py-2">
                      <span className="font-medium text-gray-700">{c.billNo}</span>
                      <span className="text-gray-500">{(c.assignmentIds ?? []).join(', ')}</span>
                      <span className="font-semibold text-red-700">₹{Math.round(c.netPayable ?? c.totalClaimedAmount ?? 0).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-gray-700">Deduct from this claim (₹)</label>
                  <input
                    type="number"
                    className="w-36 px-2 py-1.5 text-sm border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
                    value={alreadyPaidDeduction}
                    onChange={(e) => setAlreadyPaidDeduction(Number(e.target.value) || 0)}
                  />
                  <button
                    type="button"
                    disabled={alreadyPaidDeductionSaving}
                    onClick={() => applyAlreadyPaidDeduction(alreadyPaidDeduction)}
                    className="px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg"
                  >
                    {alreadyPaidDeductionSaving ? 'Saving…' : 'Apply Deduction'}
                  </button>
                  {alreadyPaidDeductionSavedValue === alreadyPaidDeduction && !alreadyPaidDeductionSaving ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">✓ Applied &amp; saved</span>
                  ) : (
                    <span className="text-xs text-gray-500">Auto-detected total: ₹{Math.round(assignmentAlreadyPaidTotal).toLocaleString('en-IN')}</span>
                  )}
                </div>
              </div>
            )}

            {/* Amount summary */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Amount Summary</h3>
              {/* Total Claimed stays the STORED original submission amount (never live-recomputed
                  — matches "View My Bills" so an untouched claim never shows two different
                  "Claimed" figures). Eligible/Net Payable/Recoverable, however, must reflect any
                  in-progress HR overrides (edited via the Edit buttons on individual DA/Travel/
                  Misc rows below) the same way the Final Payment Summary box does — those
                  overrides aren't written back to the claim record until HR actually clicks
                  Approve/Partial-Approve, so falling back to the stored total here would show a
                  number that contradicts the itemized rows HR is looking at right now. Bug fixed
                  2026-08-20: TADA-2026-00004 (Wasiuddin) — HR had already edited two travel bills
                  (900->650 approved, 859->0 rejected), Final Payment Summary correctly showed the
                  live 650, but this card still showed the stored 3,659 as if nothing changed. */}
              <AmountSummary
                claimedAmount={Math.round(claim.totalClaimedAmount ?? 0)}
                eligibleAmount={Math.round(showLiveAmounts ? liveGrandTotalINR : (claim.approvedAmount && claim.approvedAmount > 0 ? claim.approvedAmount : (claim.totalClaimedAmount ?? 0)))}
                approvedAmount={Math.round(claim.approvedAmount ?? 0)}
                deductionAmount={Math.round((claim.deductionAmount ?? 0) + alreadyPaidDeduction)}
                advanceAdjusted={advanceAdjusted}
                miscAdjustments={0}
                recoverableAmount={Math.round(showLiveAmounts ? liveRecoverableINR : (claim.recoverableAmount ?? 0))}
                netPayable={Math.round((showLiveAmounts ? liveNetPayableINR : (claim.netPayable ?? computedFinalSettlement)) - alreadyPaidDeduction)}
                currency="INR"
              />
              {/* Net payable banner — same live-first logic as above. Shown whenever live data
                  is available at all, even if the true amount is 0 (e.g. fully deduped against
                  another claim), so that correct 0 is visible rather than hidden. Suppressed once
                  the claim is Paid (see showLiveAmounts) — this banner is explicitly the "(Final)"
                  live figure, which has no place on an already-settled claim's read-only view. */}
              {showLiveAmounts && (
                <div className={`mt-4 flex items-center justify-between px-5 py-3.5 rounded-xl shadow-sm bg-gradient-to-r ${liveRecoverableINR > 0 ? 'from-red-600 to-rose-600' : 'from-emerald-700 to-teal-700'}`}>
                  <div>
                    <p className="text-xs font-semibold text-white uppercase tracking-wide">
                      {liveRecoverableINR > 0 ? '⚠️ Recoverable from Trainer (Final)' : '✅ Net Payable to Trainer (Final)'}
                    </p>
                    <p className="text-[10px] text-white/70 mt-0.5">
                      {liveRecoverableINR > 0 ? 'Advance adjusted exceeds approved amount — trainer owes back the difference' : 'All currencies converted to INR · includes HR overrides'}
                    </p>
                  </div>
                  <span className="text-2xl font-extrabold text-white">₹{Math.round((liveRecoverableINR > 0 ? liveRecoverableINR : liveNetPayableINR) - alreadyPaidDeduction).toLocaleString('en-IN')}</span>
                </div>
              )}

              {/* ── Deductions — Advance Taken (live PMS API) ── */}
              <div className="mt-5 border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />
                    Deductions — Advance Taken
                  </p>
                  <div className="flex items-center gap-2">
                    {liveAdvances.length > 0 && (
                      <>
                        <button type="button" onClick={() => { setCheckedAdvances(new Set(liveAdvances.map(i => i.key))); setPaidClaimEditedThisSession(true); }}
                          className="text-[11px] text-violet-600 hover:underline font-medium">Select All</button>
                        <span className="text-gray-300 text-xs">|</span>
                        <button type="button" onClick={() => { setCheckedAdvances(new Set()); setPaidClaimEditedThisSession(true); }}
                          className="text-[11px] text-gray-400 hover:underline font-medium">Clear All</button>
                      </>
                    )}
                    <button type="button" onClick={fetchLiveAdvances}
                      className="ml-1 text-[11px] text-blue-500 hover:underline font-medium flex items-center gap-1">
                      ↻ Refresh
                    </button>
                  </div>
                </div>

                {advancesLoading && (
                  <div className="flex items-center gap-2 py-4 text-xs text-violet-600">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Fetching advances from PMS…
                  </div>
                )}

                {advancesError && !advancesLoading && (
                  <div className="flex items-center gap-2 py-3 px-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
                    <span>⚠ {advancesError}</span>
                    <button type="button" onClick={fetchLiveAdvances} className="ml-auto underline text-red-500">Retry</button>
                  </div>
                )}

                {!advancesLoading && !advancesError && liveAdvances.length === 0 && (
                  <p className="text-xs text-gray-400 py-3 flex items-center gap-1.5">
                    <span className="text-base">ℹ</span> No advances found in PMS within 30 days of claim period
                  </p>
                )}

                {!advancesLoading && liveAdvances.length > 0 && (
                  <>
                    <div className="text-[10px] text-gray-400 mb-2">
                      {liveAdvances.length} advance{liveAdvances.length !== 1 ? 's' : ''} found in PMS for {
                        (() => {
                          const s = (claim as unknown as { claimStartDate?: string }).claimStartDate ?? '';
                          const e = (claim as unknown as { claimEndDate?: string }).claimEndDate ?? '';
                          return `${addDays(s,-30)} → ${addDays(e,30)}`;
                        })()
                      } · {checkedAdvances.size} selected
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {liveAdvances.map(item => (
                        <label key={item.key} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${checkedAdvances.has(item.key) ? 'border-violet-300 bg-violet-50/60' : 'border-gray-200 hover:bg-gray-50'}`}>
                          <input
                            type="checkbox"
                            checked={checkedAdvances.has(item.key)}
                            onChange={e => {
                              setCheckedAdvances(prev => {
                                const next = new Set(prev);
                                e.target.checked ? next.add(item.key) : next.delete(item.key);
                                return next;
                              });
                              setPaidClaimEditedThisSession(true);
                            }}
                            className="mt-0.5 w-4 h-4 accent-violet-600 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-gray-800">
                                {item.currency} {item.amount.toLocaleString('en-IN')}
                              </span>
                              {item.taBillId && (
                                <span className="font-mono text-[11px] text-violet-700 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded">{item.taBillId}</span>
                              )}
                              {item.type && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 font-medium">{item.type}</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-3 mt-0.5 text-[11px] text-gray-500">
                              <span>📅 {item.date}</span>
                              {item.narration && <span className="truncate max-w-[220px]">📝 {item.narration}</span>}
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            {checkedAdvances.has(item.key)
                              ? <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">Adjusted</span>
                              : <span className="text-[10px] text-gray-400">Excluded</span>
                            }
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between px-4 py-2.5 rounded-lg bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200">
                      <div>
                        <p className="text-[10px] text-violet-500 font-semibold uppercase tracking-wide">Total Advance Adjusted</p>
                        <p className="text-[10px] text-gray-400">{checkedAdvances.size} of {liveAdvances.length} selected</p>
                      </div>
                      <span className="text-lg font-extrabold text-violet-800">₹{advanceAdjusted.toLocaleString('en-IN')}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Final Payment Breakdown in INR ─────────────────────────────────── */}
            {/* This box is a live, in-progress breakdown for HR to check before Approve/
                Partial-Approve — it has no frozen/historical form of its own (paid claims don't
                store a per-category breakdown, only the final aggregate amounts), so it is hidden
                entirely once the claim is Paid rather than risk showing a live-recomputed total
                that no longer matches what was actually disbursed. Same fix as showLiveAmounts. */}
            {(claim.totalClaimedAmount ?? 0) > 0 && showLiveAmounts && (
              <div className="bg-white rounded-xl border-2 border-emerald-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-emerald-800 uppercase tracking-wide flex items-center gap-2">
                    <span className="text-base">💰</span> Final Payment Summary (INR)
                  </h3>
                  <span className="text-[10px] text-gray-400 italic">All foreign currencies converted to INR</span>
                </div>
                <div className="space-y-2">
                  {/* DA breakdown by currency */}
                  {(() => {
                    const daGroups: Record<string, { amount: number; inr: number }> = {};
                    effectiveDaItemsFinal.filter(li => !paidDaDates.has(li.date ?? '')).forEach(li => {
                      const cur = li.currency;
                      if (!daGroups[cur]) daGroups[cur] = { amount: 0, inr: 0 };
                      daGroups[cur].amount += li.claimedAmount;
                      daGroups[cur].inr    += toINR(li.claimedAmount, cur);
                    });
                    return Object.entries(daGroups).map(([cur, { amount, inr }]) => (
                      <div key={`da-${cur}`} className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-green-50 border border-green-100">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          <span className="text-xs font-medium text-gray-700">DA Allowance</span>
                          <span className="text-[11px] text-gray-500">
                            {cur === 'INR' ? `₹${amount.toLocaleString('en-IN')}` : `${cur} ${amount.toLocaleString('en-IN')}`}
                            {cur !== 'INR' && <span className="text-gray-400 ml-1">@ {(displayRates['INR'] && displayRates[cur] ? Math.round(displayRates['INR'] / displayRates[cur]) : FX_TO_INR[cur] ?? 84)} INR/{cur}</span>}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-green-700">₹{inr.toLocaleString('en-IN')}</span>
                      </div>
                    ));
                  })()}
                  {/* TA / Cab */}
                  {effectiveTravelItemsFinal.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-sky-50 border border-sky-100">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-sky-500" />
                        <span className="text-xs font-medium text-gray-700">Cab / Travel Allowance</span>
                        <span className="text-[11px] text-gray-500">{effectiveTravelItemsFinal.length} bill{effectiveTravelItemsFinal.length !== 1 ? 's' : ''}</span>
                      </div>
                      <span className="text-sm font-bold text-sky-700">₹{liveTATotalINR.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {/* Lodging */}
                  {(() => {
                    const lodItems = claimLineItems.filter(li => (li.expenseType as string) === 'Lodging' || (li.expenseType as string) === 'Hotel');
                    if (lodItems.length === 0) return null;
                    const lodTotal = lodItems.reduce((s, li) => s + toINR(li.claimedAmount, li.currency ?? 'INR'), 0);
                    return (
                      <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-purple-50 border border-purple-100">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-purple-500" />
                          <span className="text-xs font-medium text-gray-700">Lodging / Hotel</span>
                        </div>
                        <span className="text-sm font-bold text-purple-700">₹{lodTotal.toLocaleString('en-IN')}</span>
                      </div>
                    );
                  })()}
                  {/* Misc */}
                  {effectiveMiscItemsFinal.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-rose-50 border border-rose-100">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        <span className="text-xs font-medium text-gray-700">Miscellaneous</span>
                      </div>
                      <span className="text-sm font-bold text-rose-700">₹{liveMiscTotalINR.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {/* Advance deduction */}
                  {advanceAdjusted > 0 && (
                    <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-violet-50 border border-violet-100">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-violet-500" />
                        <span className="text-xs font-medium text-gray-700">Less: Advance Adjusted</span>
                      </div>
                      <span className="text-sm font-bold text-violet-700">− ₹{advanceAdjusted.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {/* Grand total — must be the SUM OF THIS BOX'S OWN ROWS (live DA/Travel/
                      Lodging/Misc, including any in-progress HR overrides), not the stored
                      claim total. Those overrides only get written back to the claim record
                      when HR clicks Approve/Partial-Approve, so this box would otherwise show
                      a total that doesn't add up to the very line items it just listed above
                      it — exactly what happened for TADA-2026-00004 (Wasiuddin): HR had already
                      edited two travel bills (900->650 approved, 859->0 rejected) via the Edit
                      button, the DA/Travel rows above correctly showed 1,900 + 650, but this
                      total still showed the old stored 3,659 instead of 2,550. */}
                  <div className="flex items-center justify-between px-5 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 mt-1">
                    <span className="text-sm font-bold text-white">NET PAYABLE TO TRAINER</span>
                    <span className="text-xl font-extrabold text-white">₹{Math.round(liveNetPayableINR - alreadyPaidDeduction).toLocaleString('en-IN')}</span>
                  </div>
                  {(() => {
                    const hasConversion = effectiveDaItemsFinal.some(li => li.currency !== 'INR');
                    if (!hasConversion) return null;
                    return (
                      <p className="text-[10px] text-gray-400 text-right mt-1 italic">
                        Live rates (XE): {[...new Set(effectiveDaItemsFinal.filter(li => li.currency && li.currency !== 'INR').map(li => li.currency))].map(c => `1 ${c} = ₹${displayRates['INR'] && displayRates[c] ? Math.round(displayRates['INR'] / displayRates[c]) : (FX_TO_INR[c] ?? 84)}`).join(' · ')}
                      </p>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ── Claim Summary Details ─────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Claim Summary Details</h3>
              <div className="space-y-3">
                {/* 1. Assignment Details — Step 2 exact replica via shared mapRawToAssignment */}
                {(() => {
                  const open = summaryOpen.assignment;
                  // ILO (Online) batches are excluded — DA is calculated only for ILT and FMAT (offline/face-to-face)
                  const visibleAssignments = summaryAssignments.filter(a => {
                    const bdm = (a.batchType ?? '').toUpperCase().trim();
                    if (!bdm) return true; // no batch type info — keep
                    return bdm !== 'ILO' && !bdm.startsWith('ILO');
                  });
                  const deliveryColor = (m: string) => m === 'Online' ? 'bg-green-100 text-green-700' : m === 'Hybrid' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700';
                  const deliveryDot   = (m: string) => m === 'Online' ? 'bg-green-500' : m === 'Hybrid' ? 'bg-blue-500' : 'bg-orange-500';
                  return (
                    <div className="border border-indigo-100 rounded-lg overflow-hidden">
                      <button onClick={() => setSummaryOpen(p => ({ ...p, assignment: !p.assignment }))}
                        className="w-full flex items-center justify-between px-4 py-3 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                        <span className="text-sm font-semibold text-indigo-800">📋 Assignment Details</span>
                        <span className="text-indigo-500 text-xs">{open ? '▲' : '▼'}</span>
                      </button>
                      {open && (
                        <div className="px-0 py-0">
                          {summaryAssignmentsLoading ? (
                            <p className="px-4 py-3 text-xs text-gray-400 animate-pulse">Loading assignment data from PMS…</p>
                          ) : summaryAssignments.length === 0 ? (
                            /* Fallback: show stored claim assignment data when PMS returns nothing */
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-50 border-b border-gray-200">
                                    {['Assignment ID','Client','Location','Period','International','Destinations'].map(h => (
                                      <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="hover:bg-indigo-50/30">
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                      {(claim.assignmentIds ?? []).length > 0
                                        ? (claim.assignmentIds ?? []).map(id => (
                                            <span key={id} className="font-mono text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded mr-1">{id}</span>
                                          ))
                                        : <span className="text-gray-400">—</span>}
                                    </td>
                                    <td className="px-3 py-2.5 text-gray-800 font-medium">{claim.clientName || '—'}</td>
                                    <td className="px-3 py-2.5 text-gray-700">{claim.trainingLocation || '—'}</td>
                                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">
                                      {(claim as unknown as { claimStartDate?: string }).claimStartDate
                                        ? `${new Date((claim as unknown as { claimStartDate: string }).claimStartDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} → ${new Date((claim as unknown as { claimEndDate?: string }).claimEndDate ?? '').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
                                        : '—'}
                                    </td>
                                    <td className="px-3 py-2.5">
                                      {claim.destinationCities?.some(c => c !== 'India')
                                        ? <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700">Yes</span>
                                        : <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600">No</span>}
                                    </td>
                                    <td className="px-3 py-2.5 text-gray-700">{(claim.destinationCities ?? []).join(', ') || '—'}</td>
                                  </tr>
                                </tbody>
                              </table>
                              <p className="px-4 py-2 text-[10px] text-amber-600 bg-amber-50 border-t border-amber-100">
                                ⚠ Live PMS data unavailable — showing submitted claim data
                              </p>
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-50 border-b border-gray-200">
                                    {['Assignment ID','Batch ID','Course Name','Client','Batch Type','Mode','Start Date','End Date','City','Country','Venue','Trainer','SCID','Pax','Start Time','End Time'].map(h => (
                                      <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {visibleAssignments.map((a, i) => (
                                    <tr key={i} className="hover:bg-indigo-50/30">
                                      <td className="px-3 py-2.5 whitespace-nowrap">
                                        {a.assignmentId ? <span className="font-mono text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">{a.assignmentId}</span> : <span className="text-gray-400">—</span>}
                                      </td>
                                      <td className="px-3 py-2.5 whitespace-nowrap">
                                        {a.batchId ? <span className="font-mono text-[11px] text-violet-700 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded">{a.batchId}</span> : <span className="text-gray-400">—</span>}
                                      </td>
                                      <td className="px-3 py-2.5 font-medium text-gray-800 max-w-[220px]">
                                        <div className="truncate text-[12px]" title={a.courseName}>{a.courseName || '—'}</div>
                                      </td>
                                      <td className="px-3 py-2.5 max-w-[160px]">
                                        <div className="truncate text-[11px] text-gray-700" title={a.clientName}>{a.clientName || '—'}</div>
                                      </td>
                                      <td className="px-3 py-2.5 whitespace-nowrap">
                                        {a.batchType ? <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700">{a.batchType}</span> : <span className="text-gray-400">—</span>}
                                      </td>
                                      <td className="px-3 py-2.5 whitespace-nowrap">
                                        {a.deliveryMode ? (
                                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${deliveryColor(a.deliveryMode)}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${deliveryDot(a.deliveryMode)}`} />
                                            {a.deliveryMode}
                                          </span>
                                        ) : <span className="text-gray-400">—</span>}
                                      </td>
                                      <td className="px-3 py-2.5 whitespace-nowrap">
                                        {a.startDate ? <span className="px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-800 font-semibold text-[11px]">{fmtAssignmentDate(a.startDate)}</span> : <span className="text-gray-400">—</span>}
                                      </td>
                                      <td className="px-3 py-2.5 whitespace-nowrap">
                                        {a.endDate ? <span className="px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-800 font-semibold text-[11px]">{fmtAssignmentDate(a.endDate)}</span> : <span className="text-gray-400">—</span>}
                                      </td>
                                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">{a.city || '—'}</td>
                                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">{a.country || '—'}</td>
                                      <td className="px-3 py-2.5 max-w-[160px]">
                                        <div className="truncate text-[11px] text-gray-700" title={a.trainingVenue}>{a.trainingVenue || '—'}</div>
                                      </td>
                                      <td className="px-3 py-2.5 max-w-[140px]">
                                        <div className="truncate text-[11px] text-gray-700" title={a.trainerName}>{a.trainerName || '—'}</div>
                                      </td>
                                      <td className="px-3 py-2.5 whitespace-nowrap">
                                        {a.scid ? <span className="font-mono text-[11px] text-cyan-700 bg-cyan-50 border border-cyan-100 px-1.5 py-0.5 rounded">{a.scid}</span> : <span className="text-gray-400">—</span>}
                                      </td>
                                      <td className="px-3 py-2.5 whitespace-nowrap text-center font-medium text-gray-700">{a.noOfParticipants || a.totalPax || '—'}</td>
                                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">{a.startTime || '—'}</td>
                                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">{a.endTime || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 2. Leave Dates — Step 3 exact replica */}
                {(() => {
                  const open = summaryOpen.leaves;
                  const fmtD = (iso: string | null) => {
                    if (!iso) return '—';
                    const d = new Date(iso);
                    if (isNaN(d.getTime())) return iso;
                    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                  };
                  const approved  = summaryLeaves.filter(r => isApprovedLeave(r.leave_status)).length;
                  const pending   = summaryLeaves.filter(r => isPendingLeave(r.leave_status)).length;
                  const cancelled = summaryLeaves.filter(r => isCancelledLeave(r.leave_status)).length;
                  return (
                    <div className="border border-amber-100 rounded-lg overflow-hidden">
                      <button onClick={() => setSummaryOpen(p => ({ ...p, leaves: !p.leaves }))}
                        className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors">
                        <span className="text-sm font-semibold text-amber-800">🗓️ Leave Dates</span>
                        <span className="text-amber-500 text-xs flex items-center gap-2">
                          {summaryLeaves.length > 0 && <span className="font-bold text-amber-700">{summaryLeaves.length} record{summaryLeaves.length !== 1 ? 's' : ''}</span>}
                          {open ? '▲' : '▼'}
                        </span>
                      </button>
                      {open && (
                        <div className="px-4 py-3">
                          {summaryLeavesLoading ? (
                            <p className="text-gray-400 text-xs animate-pulse">Loading leave data from PMS…</p>
                          ) : summaryLeaves.length === 0 ? (
                            <p className="text-gray-400 text-xs">No leave records found for this period.</p>
                          ) : (
                            <>
                              {/* Summary mini-cards */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                {[
                                  { label: 'Total Leaves', value: summaryLeaves.length,  color: 'bg-orange-50 text-orange-700 border border-orange-100' },
                                  { label: 'Approved',     value: approved,               color: 'bg-green-50 text-green-700 border border-green-100' },
                                  { label: 'Pending',      value: pending,                color: 'bg-amber-50 text-amber-700 border border-amber-100' },
                                  { label: 'Cancelled',    value: cancelled,              color: 'bg-red-50 text-red-700 border border-red-100' },
                                ].map(c => (
                                  <div key={c.label} className={`rounded-xl px-4 py-3 ${c.color}`}>
                                    <p className="text-xs font-medium opacity-70">{c.label}</p>
                                    <p className="text-2xl font-bold mt-0.5">{c.value}</p>
                                  </div>
                                ))}
                              </div>
                              {/* Leave records table */}
                              <div className="rounded-xl border border-orange-200 overflow-hidden">
                                <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-50 border-b border-orange-200 text-orange-800 text-xs font-semibold">
                                  🗓️ {summaryLeaves.length} leave record{summaryLeaves.length !== 1 ? 's' : ''} from Koenig PMS
                                  <span className="ml-1 px-2 py-0.5 rounded-full bg-orange-200 text-orange-800 text-[10px]">Approved leaves auto-marked on DA grid</span>
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
                                      {summaryLeaves.map((r, idx) => {
                                        const isApproved  = isApprovedLeave(r.leave_status);
                                        const isPending   = isPendingLeave(r.leave_status);
                                        const isCancelled = isCancelledLeave(r.leave_status);
                                        const fd = r.from_date ?? '';
                                        const td = r.to_date ?? '';
                                        const days = r.no_of_days ?? (fd && td
                                          ? Math.max(1, Math.round((new Date(td + 'T00:00:00').getTime() - new Date(fd + 'T00:00:00').getTime()) / 86400000) + 1)
                                          : 1);
                                        const halfDay = r.is_half_day || (r.half_day && r.half_day !== '0' && r.half_day !== 'false') || ((r.duration ?? '').toLowerCase().includes('half'));
                                        return (
                                          <tr key={idx} className={isCancelled ? 'bg-red-50/30 opacity-70' : isApproved ? 'bg-orange-50/40' : 'bg-white hover:bg-gray-50'}>
                                            <td className={`px-3 py-2.5 text-gray-500 font-mono text-[11px] whitespace-nowrap ${isCancelled ? 'line-through' : ''}`}>{r.emp_code ?? '—'}</td>
                                            <td className={`px-3 py-2.5 font-medium text-gray-800 whitespace-nowrap ${isCancelled ? 'line-through' : ''}`}>{r.emp_name ?? '—'}</td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                              <div className="flex flex-col gap-0.5">
                                                {r.leave_type
                                                  ? <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400 line-through' : 'bg-blue-100 text-blue-700'}`}>{r.leave_type}</span>
                                                  : <span className="text-gray-400">—</span>}
                                                {halfDay && <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 text-[10px] font-medium">Half Day</span>}
                                              </div>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                              {fd ? <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${isCancelled ? 'bg-gray-50 border border-gray-200 text-gray-400 line-through' : 'bg-orange-50 border border-orange-200 text-orange-800'}`}>{fmtD(fd)}</span> : <span className="text-gray-400">—</span>}
                                            </td>
                                            <td className={`px-3 py-2.5 text-gray-500 whitespace-nowrap ${isCancelled ? 'line-through' : ''}`}>{r.from_time ? String(r.from_time).slice(0, 5) : '—'}</td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                              {td ? <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${isCancelled ? 'bg-gray-50 border border-gray-200 text-gray-400 line-through' : 'bg-red-50 border border-red-200 text-red-800'}`}>{fmtD(td)}</span> : <span className="text-gray-400">—</span>}
                                            </td>
                                            <td className={`px-3 py-2.5 text-gray-500 whitespace-nowrap ${isCancelled ? 'line-through' : ''}`}>{r.to_time ? String(r.to_time).slice(0, 5) : '—'}</td>
                                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                              <span className={`px-2 py-0.5 rounded-full font-semibold text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400 line-through' : 'bg-purple-100 text-purple-700'}`}>{days}d</span>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${isCancelled ? 'bg-red-100 text-red-600' : isApproved ? 'bg-green-100 text-green-700' : isPending ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                                                {r.leave_status ?? '—'}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{r.leave_approval_date ? fmtD(r.leave_approval_date) : '—'}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 3. DA Eligibility — Step 4 exact replica */}
                {(() => {
                  // Use component-level corrected DA (already computed as useMemo)
                  const daItems = correctedDaItems;
                  const open = summaryOpen.da;
                  const fmtD = (iso: string) => {
                    if (!iso) return '—';
                    const d = new Date(iso);
                    if (isNaN(d.getTime())) return iso;
                    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                  };
                  const fmtDA = (amt: number, cur: string) =>
                    cur === 'INR' ? `₹${amt.toLocaleString('en-IN')}` : `${cur} ${amt.toLocaleString('en-IN')}`;
                  // Infer statusClass from description text (same logic as CreateTADABill)
                  const statusClassFor = (desc: string): string => {
                    const d = desc.toLowerCase();
                    if (d.includes('leave'))                       return 'bg-red-100 text-red-600';
                    if (d.includes('pre-batch') || d.includes('post-batch')) return 'bg-teal-50 text-teal-700 border border-teal-200';
                    if (d.includes('allowed (today)'))             return 'bg-green-100 text-green-700';
                    if (d.includes('allowed'))                     return 'bg-green-100 text-green-700';
                    if (d.includes('not applicable'))              return 'bg-gray-100 text-gray-500';
                    return 'bg-gray-100 text-gray-500';
                  };
                  // Extract status string from description "Daily Allowance — {country} ({status})"
                  const statusFrom = (desc: string): string => {
                    const m = desc.match(/\(([^)]+)\)\s*$/);
                    return m ? m[1] : desc;
                  };
                  // Parse day name from ISO date
                  const dayName = (iso: string) => {
                    const d = new Date(iso + 'T00:00:00');
                    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { weekday: 'short' });
                  };
                  // Totals
                  // Use component-level effectiveDaItemsFinal (corrected + HR overrides)
                  const effectiveDaItems = effectiveDaItemsFinal;
                  // Exclude already-paid dates from totals (they're shown greyed in the table)
                  const unpaidDaItems = effectiveDaItems.filter(li => !paidDaDates.has(li.date ?? ''));
                  const inrTotal = unpaidDaItems.filter(li => li.currency === 'INR').reduce((s, li) => s + li.claimedAmount, 0);
                  const foreignMap: Record<string, number> = {};
                  unpaidDaItems.filter(li => li.currency !== 'INR').forEach(li => {
                    foreignMap[li.currency] = (foreignMap[li.currency] ?? 0) + li.claimedAmount;
                  });
                  const paidDaCount = effectiveDaItems.filter(li => paidDaDates.has(li.date ?? '')).length;
                  // Country rate summary from unique expenseSubType values (unpaid only)
                  const countryRates: Record<string, { rate: number; currency: string }> = {};
                  unpaidDaItems.forEach(li => {
                    const c = li.expenseSubType ?? '';
                    if (c && !countryRates[c]) countryRates[c] = { rate: li.policyLimit, currency: li.currency };
                  });
                  return (
                    <div className="border border-green-100 rounded-lg overflow-hidden">
                      <button onClick={() => setSummaryOpen(p => ({ ...p, da: !p.da }))}
                        className="w-full flex items-center justify-between px-4 py-3 bg-green-50 hover:bg-green-100 transition-colors">
                        <span className="text-sm font-semibold text-green-800">✅ DA Eligibility &amp; Auto Calculation</span>
                        <span className="text-green-500 text-xs flex items-center gap-2">
                          {inrTotal > 0 && <span className="font-bold text-green-700">₹{inrTotal.toLocaleString('en-IN')}</span>}
                          {Object.entries(foreignMap).map(([c, a]) => <span key={c} className="font-bold text-blue-700">{c} {a.toLocaleString('en-IN')}</span>)}
                          {open ? '▲' : '▼'}
                        </span>
                      </button>
                      {open && (
                        <div>
                          {daItems.length === 0 ? (
                            <p className="px-4 py-3 text-gray-400 text-xs">No DA line items found for this bill.</p>
                          ) : (
                            <>
                              {/* Already-paid DA warning banner */}
                              {paidDaCount > 0 && (
                                <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                                  <span className="text-red-500 text-base mt-0.5">⚠️</span>
                                  <div>
                                    <p className="text-xs font-semibold text-red-700">DA Already Paid — {paidDaCount} day{paidDaCount !== 1 ? 's' : ''} greyed out</p>
                                    <p className="text-xs text-red-600 mt-0.5">These dates were already covered in another approved/paid claim for this trainer. They are excluded from the totals below.</p>
                                  </div>
                                </div>
                              )}
                              {/* Summary cards */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 pt-4 pb-3">
                                {[
                                  { label: 'Eligible Days',  value: `${unpaidDaItems.length}${paidDaCount > 0 ? ` (${paidDaCount} already paid)` : ''}`,   color: 'bg-green-50 text-green-700 border border-green-100' },
                                  { label: 'INR DA Total',   value: `₹${inrTotal.toLocaleString('en-IN')}`, color: 'bg-blue-50 text-blue-700 border border-blue-100' },
                                  ...Object.entries(foreignMap).map(([c, a]) => ({
                                    label: `${c} DA Total`, value: `${c} ${a.toLocaleString('en-IN')}`, color: 'bg-indigo-50 text-indigo-700 border border-indigo-100',
                                  })),
                                  { label: 'Countries',      value: Object.keys(countryRates).length, color: 'bg-purple-50 text-purple-700 border border-purple-100' },
                                ].map(c => (
                                  <div key={c.label} className={`rounded-xl px-4 py-3 ${c.color}`}>
                                    <p className="text-xs font-medium opacity-70">{c.label}</p>
                                    <p className="text-xl font-bold mt-0.5">{c.value}</p>
                                  </div>
                                ))}
                              </div>
                              {/* Country DA rate chips */}
                              {Object.keys(countryRates).length > 0 && (
                                <div className="flex flex-wrap gap-2 px-4 pb-3">
                                  <span className="text-xs font-semibold text-gray-500 self-center">DA Rates:</span>
                                  {Object.entries(countryRates).map(([c, { rate, currency }]) => (
                                    <span key={c} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-green-50 border-green-200 text-green-800 text-xs font-medium">
                                      <span className="font-semibold">{c}</span>
                                      <span className="text-green-600">{currency === 'INR' ? '₹' : currency} {rate}/day</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                              {/* DA table */}
                              <div className="overflow-x-auto border-t border-gray-200">
                                <table className="min-w-full text-xs">
                                  <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                      {['Date','Day','Country','DA Status','DA Rate','Amount','Remarks', ...(currentUser.role === 'HRAdmin' ? ['HR Override'] : [])].map(h => (
                                        <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {daItems.map((li, i) => {
                                      const override = li.date ? daHrOverrides[li.date] : undefined;
                                      const dispCurrency = override?.currency ?? li.currency;
                                      const dispAmount   = override?.amount   ?? li.claimedAmount;
                                      const dispCountry  = override?.country  ?? (li.expenseSubType ?? '—');
                                      const dispRate     = override ? override.amount : li.policyLimit;
                                      const status  = statusFrom(li.description);
                                      const sc      = statusClassFor(li.description);
                                      const isEditing = daEditIdx === i;
                                      const alreadyPaidBill = paidDaDates.get(li.date ?? '');

                                      if (isEditing && currentUser.role === 'HRAdmin') {
                                        return (
                                          <tr key={i} className="bg-amber-50 border-l-4 border-amber-400">
                                            <td className="px-4 py-2 font-medium text-gray-700 whitespace-nowrap">{fmtD(li.date ?? '')}</td>
                                            <td className="px-4 py-2 text-gray-600">{li.date ? dayName(li.date) : '—'}</td>
                                            {/* Country */}
                                            <td className="px-3 py-2">
                                              <input
                                                type="text"
                                                value={daEditValues.country}
                                                onChange={e => setDaEditValues(v => ({ ...v, country: e.target.value }))}
                                                className="w-28 border border-amber-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                                                placeholder="Country"
                                              />
                                            </td>
                                            <td className="px-4 py-2">
                                              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${sc}`}>{status}</span>
                                            </td>
                                            {/* Currency + Rate */}
                                            <td className="px-3 py-2">
                                              <div className="flex items-center gap-1">
                                                <select
                                                  value={daEditValues.currency}
                                                  onChange={e => setDaEditValues(v => ({ ...v, currency: e.target.value }))}
                                                  className="border border-amber-300 rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                                                >
                                                  <option value="INR">INR (₹)</option>
                                                  <option value="USD">USD</option>
                                                  <option value="AED">AED</option>
                                                  <option value="EUR">EUR</option>
                                                  <option value="GBP">GBP</option>
                                                  <option value="SGD">SGD</option>
                                                  <option value="AUD">AUD</option>
                                                  <option value="CAD">CAD</option>
                                                </select>
                                                <input
                                                  type="number"
                                                  min={0}
                                                  value={daEditValues.amount}
                                                  onChange={e => setDaEditValues(v => ({ ...v, amount: Number(e.target.value) }))}
                                                  className="w-20 border border-amber-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                                                />
                                              </div>
                                            </td>
                                            {/* Amount (same as rate for DA) */}
                                            <td className="px-4 py-2 font-semibold text-amber-700">
                                              {daEditValues.currency === 'INR' ? `₹${daEditValues.amount}` : `${daEditValues.currency} ${daEditValues.amount}`}
                                            </td>
                                            <td className="px-4 py-2 text-gray-500 max-w-[180px] truncate">{li.description}</td>
                                            <td className="px-3 py-2">
                                              <div className="flex items-center gap-1.5">
                                                <button
                                                  onClick={() => {
                                                    if (!li.date) { setDaEditIdx(null); return; }
                                                    const next = { ...daHrOverrides, [li.date]: { country: daEditValues.country, currency: daEditValues.currency, amount: daEditValues.amount } };
                                                    setDaHrOverrides(next);
                                                    persistHrOverrideField('daHrOverrides', next);
                                                    setDaEditIdx(null);
                                                  }}
                                                  className="px-2.5 py-1 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-700"
                                                >Save</button>
                                                <button
                                                  onClick={() => setDaEditIdx(null)}
                                                  className="px-2.5 py-1 rounded bg-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-300"
                                                >Cancel</button>
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      }

                                      return (
                                        <tr key={i} className={`${alreadyPaidBill ? 'bg-gray-100 opacity-60' : override ? 'bg-amber-50/40' : 'hover:bg-blue-50/30'}`}>
                                          <td className="px-4 py-3 font-medium whitespace-nowrap">
                                            <div className={alreadyPaidBill ? 'text-gray-400 line-through' : 'text-gray-700'}>{fmtD(li.date ?? '')}</div>
                                          </td>
                                          <td className={`px-4 py-3 ${alreadyPaidBill ? 'text-gray-400' : 'text-gray-600'}`}>{li.date ? dayName(li.date) : '—'}</td>
                                          <td className={`px-4 py-3 ${alreadyPaidBill ? 'text-gray-400' : 'text-gray-600'}`}>
                                            {dispCountry}
                                            {override && !alreadyPaidBill && <span className="ml-1 text-[10px] text-amber-600 font-semibold">(HR)</span>}
                                          </td>
                                          <td className="px-4 py-3">
                                            {alreadyPaidBill ? (
                                              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-600 border border-red-200">
                                                Already Paid — {alreadyPaidBill}
                                              </span>
                                            ) : (
                                              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${sc}`}>{status}</span>
                                            )}
                                          </td>
                                          <td className={`px-4 py-3 ${alreadyPaidBill ? 'text-gray-400' : 'text-gray-700'}`}>{dispRate > 0 ? fmtDA(dispRate, dispCurrency) : '—'}</td>
                                          <td className={`px-4 py-3 font-semibold ${alreadyPaidBill ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{dispAmount > 0 ? fmtDA(dispAmount, dispCurrency) : '—'}</td>
                                          <td className="px-4 py-3 text-gray-500 max-w-[220px] truncate" title={li.description}>{li.description}</td>
                                          {currentUser.role === 'HRAdmin' && (
                                            <td className="px-3 py-3">
                                              {!alreadyPaidBill && (
                                              <button
                                                onClick={() => {
                                                  setDaEditIdx(i);
                                                  setDaEditValues({
                                                    country:  override?.country  ?? (li.expenseSubType ?? ''),
                                                    currency: override?.currency ?? li.currency,
                                                    amount:   override?.amount   ?? li.claimedAmount,
                                                  });
                                                }}
                                                className="flex items-center gap-1 px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:bg-amber-50 hover:border-amber-400 hover:text-amber-700 text-xs font-medium transition-colors"
                                                title="Override DA for this row"
                                              >
                                                ✏️ Edit
                                              </button>
                                              )}
                                            </td>
                                          )}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              {/* Footer totals */}
                              <div className="px-5 py-4 bg-green-50 border-t-2 border-green-200">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Auto DA Total:</span>
                                    {inrTotal > 0 && <span className="text-base font-bold text-green-700">₹{inrTotal.toLocaleString('en-IN')}</span>}
                                    {Object.entries(foreignMap).map(([cur, amt]) => (
                                      <span key={cur} className="text-base font-bold text-blue-700">{cur} {amt.toLocaleString('en-IN')}</span>
                                    ))}
                                    {inrTotal === 0 && Object.keys(foreignMap).length === 0 && <span className="text-gray-400 text-sm">—</span>}
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 4. Flight & Travel Details — Step 5 exact replica */}
                {(() => {
                  const open = summaryOpen.flights;
                  const fmtD = (iso: string) => {
                    if (!iso) return '—';
                    const d = new Date(iso);
                    if (isNaN(d.getTime())) return iso;
                    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                  };
                  const active    = summaryFlights.filter(f => f.Is_cancelled !== 'Yes');
                  const cancelled = summaryFlights.filter(f => f.Is_cancelled === 'Yes');
                  const withTicket = summaryFlights.filter(f => !!f.ticket_path);
                  const transportTypes = Array.from(new Set(summaryFlights.map(f => f.transport_type).filter(Boolean)));
                  return (
                    <div className="border border-sky-100 rounded-lg overflow-hidden">
                      <button onClick={() => setSummaryOpen(p => ({ ...p, flights: !p.flights }))}
                        className="w-full flex items-center justify-between px-4 py-3 bg-sky-50 hover:bg-sky-100 transition-colors">
                        <span className="text-sm font-semibold text-sky-800">✈️ Flight &amp; Travel Details</span>
                        <span className="text-sky-500 text-xs flex items-center gap-2">
                          {summaryFlights.length > 0 && <span className="font-bold text-sky-700">{summaryFlights.length} record{summaryFlights.length !== 1 ? 's' : ''}</span>}
                          {open ? '▲' : '▼'}
                        </span>
                      </button>
                      {open && (
                        <div>
                          {summaryFlightsLoading ? (
                            <p className="px-4 py-3 text-xs text-gray-400 animate-pulse">Loading flight data from PMS…</p>
                          ) : summaryFlights.length === 0 ? (
                            <p className="px-4 py-3 text-xs text-gray-400">No flight/travel records found for this period.</p>
                          ) : (
                            <>
                              {/* Summary mini-cards */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 pt-4 pb-3">
                                {[
                                  { label: 'In Range',       value: summaryFlights.length, sub: 'total records',           color: 'bg-blue-50 text-blue-700 border border-blue-100' },
                                  { label: 'Active',         value: active.length,          sub: `${cancelled.length} cancelled`, color: 'bg-green-50 text-green-700 border border-green-100' },
                                  { label: 'With Ticket',    value: withTicket.length,      sub: 'documents available',    color: 'bg-teal-50 text-teal-700 border border-teal-100' },
                                  { label: 'Transport Types',value: transportTypes.length || new Set(summaryFlights.map(f => f.airlines_name).filter(Boolean)).size,
                                    sub: transportTypes.join(', ') || 'airlines', color: 'bg-purple-50 text-purple-700 border border-purple-100' },
                                ].map(c => (
                                  <div key={c.label} className={`rounded-xl px-4 py-3 ${c.color}`}>
                                    <p className="text-xs font-medium opacity-70">{c.label}</p>
                                    <p className="text-2xl font-bold mt-0.5">{c.value}</p>
                                    <p className="text-[10px] opacity-60 mt-0.5 truncate">{c.sub}</p>
                                  </div>
                                ))}
                              </div>
                              {/* Flight table */}
                              <div className="overflow-x-auto border-t border-gray-200">
                                <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border-b border-blue-100">
                                  <span className="text-xs font-semibold text-blue-800">✈️ {active.length} active record{active.length !== 1 ? 's' : ''} · sorted oldest → newest</span>
                                </div>
                                <table className="min-w-full text-xs">
                                  <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                      {['Trip ID','Type','Flight No.','Airline / Carrier','From','To','Departure','Dep. Time','Arrival','Arr. Time','Status','Ticket','Insurance'].map(h => (
                                        <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold whitespace-nowrap text-[11px]">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100 bg-white">
                                    {summaryFlights.map((f, idx) => {
                                      const isCancelled = f.Is_cancelled === 'Yes';
                                      const depDate = parseDT(String(f.departure_date ?? ''));
                                      const arrDate = parseDT(String(f.arrival_date ?? ''));
                                      const transport = f.transport_type ? String(f.transport_type).trim() : null;
                                      const isAir = !transport || transport.toLowerCase().includes('flight') || transport.toLowerCase().includes('air');
                                      const typeColor = isAir ? 'bg-blue-100 text-blue-700'
                                        : transport?.toLowerCase().includes('train') ? 'bg-green-100 text-green-700'
                                        : 'bg-orange-100 text-orange-700';
                                      const BASE_URL = 'https://api.koenig-solutions.com';
                                      const toUrl = (p: unknown) => {
                                        if (!p) return null;
                                        const s = String(p);
                                        return s.startsWith('http') ? s : `${BASE_URL}${s.startsWith('/') ? '' : '/'}${s}`;
                                      };
                                      const ticketUrl    = toUrl(f.ticket_path);
                                      const insuranceUrl = toUrl(f.insurance_path);
                                      return (
                                        <tr key={idx} className={isCancelled ? 'bg-red-50/50 opacity-70' : idx % 2 === 0 ? 'bg-white hover:bg-blue-50/30' : 'bg-gray-50/40 hover:bg-blue-50/30'}>
                                          <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap font-mono text-[11px]">{String(f.trip_ID ?? '—')}</td>
                                          <td className="px-3 py-2.5 whitespace-nowrap">
                                            {transport
                                              ? <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${typeColor}`}>{transport}</span>
                                              : <span className="px-2 py-0.5 rounded-full font-semibold text-[10px] bg-blue-100 text-blue-700">Flight</span>}
                                          </td>
                                          <td className={`px-3 py-2.5 font-semibold whitespace-nowrap ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{String(f.flight_number ?? '—')}</td>
                                          <td className="px-3 py-2.5 whitespace-nowrap">
                                            {f.airlines_name
                                              ? <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400' : 'bg-blue-100 text-blue-700'}`}>{String(f.airlines_name)}</span>
                                              : <span className="text-gray-400">—</span>}
                                          </td>
                                          <td className={`px-3 py-2.5 font-medium whitespace-nowrap ${isCancelled ? 'text-gray-400' : 'text-gray-800'}`}>{String(f.from_city ?? '—')}</td>
                                          <td className={`px-3 py-2.5 font-medium whitespace-nowrap ${isCancelled ? 'text-gray-400' : 'text-gray-800'}`}>{String(f.to_city ?? '—')}</td>
                                          <td className="px-3 py-2.5 whitespace-nowrap">
                                            {depDate ? <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400' : 'bg-teal-50 border border-teal-200 text-teal-800'}`}>{fmtD(depDate)}</span> : <span className="text-gray-400">—</span>}
                                          </td>
                                          <td className={`px-3 py-2.5 whitespace-nowrap ${isCancelled ? 'text-gray-400' : 'text-gray-600'}`}>{parseTM(String(f.departure_time ?? '')) || '—'}</td>
                                          <td className="px-3 py-2.5 whitespace-nowrap">
                                            {arrDate ? <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400' : 'bg-orange-50 border border-orange-200 text-orange-800'}`}>{fmtD(arrDate)}</span> : <span className="text-gray-400">—</span>}
                                          </td>
                                          <td className={`px-3 py-2.5 whitespace-nowrap ${isCancelled ? 'text-gray-400' : 'text-gray-600'}`}>{parseTM(String(f.arrival_time ?? '')) || '—'}</td>
                                          <td className="px-3 py-2.5 whitespace-nowrap">
                                            {isCancelled
                                              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold text-[10px]">✕ Cancelled</span>
                                              : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold text-[10px]">✓ Active</span>}
                                          </td>
                                          <td className="px-3 py-2.5">
                                            {ticketUrl
                                              ? <a href={ticketUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-600 text-[11px] font-medium transition-colors">↗ View</a>
                                              : <span className="text-gray-300 text-[11px]">—</span>}
                                          </td>
                                          <td className="px-3 py-2.5">
                                            {insuranceUrl
                                              ? <a href={insuranceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-600 text-[11px] font-medium transition-colors">↗ View</a>
                                              : <span className="text-gray-300 text-[11px]">—</span>}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 5. Lodging / Hotel Stays — Step 6 exact replica */}
                {(() => {
                  const open = summaryOpen.lodging;
                  const fmtD = (iso: string) => {
                    if (!iso) return '—';
                    const d = new Date(iso);
                    if (isNaN(d.getTime())) return iso;
                    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                  };
                  const activeStays    = summaryAccom.filter(r => r.Is_caneclled !== '1' && r.Is_caneclled !== 1);
                  const cancelledCount = summaryAccom.length - activeStays.length;
                  const totalNights    = activeStays.reduce((s, r) => s + Number(r.Nights ?? 0), 0);
                  const cities         = new Set(summaryAccom.map(r => r.CityName).filter(Boolean)).size;
                  const BASE_URL = 'https://api.koenig-solutions.com';
                  const toPdfUrl = (p: unknown) => {
                    if (!p) return null;
                    const s = String(p);
                    return s.startsWith('http') ? s : `${BASE_URL}${s.startsWith('/') ? '' : '/'}${s}`;
                  };
                  return (
                    <div className="border border-teal-100 rounded-lg overflow-hidden">
                      <button onClick={() => setSummaryOpen(p => ({ ...p, lodging: !p.lodging }))}
                        className="w-full flex items-center justify-between px-4 py-3 bg-teal-50 hover:bg-teal-100 transition-colors">
                        <span className="text-sm font-semibold text-teal-800">🏨 Lodging / Hotel Stays</span>
                        <span className="text-teal-500 text-xs flex items-center gap-2">
                          {summaryAccom.length > 0 && <span className="font-bold text-teal-700">{summaryAccom.length} stay{summaryAccom.length !== 1 ? 's' : ''}</span>}
                          {open ? '▲' : '▼'}
                        </span>
                      </button>
                      {open && (
                        <div>
                          {summaryAccomLoading ? (
                            <p className="px-4 py-3 text-xs text-gray-400 animate-pulse">Loading accommodation data from PMS…</p>
                          ) : summaryAccom.length === 0 ? (
                            <p className="px-4 py-3 text-xs text-gray-400">No accommodation records found for this period.</p>
                          ) : (
                            <>
                              {/* Summary mini-cards */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 pt-4 pb-3">
                                {[
                                  { label: 'Stays in Range', value: summaryAccom.length, sub: 'total records',          color: 'bg-teal-50 text-teal-700 border border-teal-100' },
                                  { label: 'Active Stays',   value: activeStays.length,  sub: `${cancelledCount} cancelled`, color: 'bg-green-50 text-green-700 border border-green-100' },
                                  { label: 'Total Nights',   value: totalNights,          sub: 'active stays only',      color: 'bg-blue-50 text-blue-700 border border-blue-100' },
                                  { label: 'Cities',         value: cities,               sub: 'unique cities',          color: 'bg-purple-50 text-purple-700 border border-purple-100' },
                                ].map(c => (
                                  <div key={c.label} className={`rounded-xl px-4 py-3 ${c.color}`}>
                                    <p className="text-xs font-medium opacity-70">{c.label}</p>
                                    <p className="text-2xl font-bold mt-0.5">{c.value}</p>
                                    <p className="text-[10px] opacity-60 mt-0.5">{c.sub}</p>
                                  </div>
                                ))}
                              </div>
                              {/* Accommodation table */}
                              <div className="overflow-x-auto border-t border-gray-200">
                                <div className="flex items-center px-4 py-2 bg-teal-50 border-b border-teal-100">
                                  <span className="text-xs font-semibold text-teal-800">🏨 {summaryAccom.length} stay{summaryAccom.length !== 1 ? 's' : ''} · sorted oldest → newest</span>
                                </div>
                                <table className="min-w-full text-xs">
                                  <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                      {['Emp ID','Trainer','Accommodation','City','Room No','Check-In','Check-Out','Nights','Stay Dates','Status','PDF'].map(h => (
                                        <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold whitespace-nowrap text-[11px]">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100 bg-white">
                                    {summaryAccom.map((r, idx) => {
                                      const isCancelled = r.Is_caneclled === '1' || r.Is_caneclled === 1;
                                      const ci = parseDT(String(r.CheckInDate ?? ''));
                                      const co = parseDT(String(r.CheckOutDate ?? ''));
                                      const pdfUrl = toPdfUrl(r.AccommodationPDF);
                                      return (
                                        <tr key={idx} className={
                                          isCancelled ? 'bg-red-50/60 opacity-70'
                                          : idx % 2 === 0 ? 'bg-white hover:bg-teal-50/30'
                                          : 'bg-gray-50/40 hover:bg-teal-50/30'
                                        }>
                                          <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap text-[11px] font-mono">{String(r.EmpId ?? '—')}</td>
                                          <td className={`px-3 py-2.5 whitespace-nowrap font-medium ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                            {String(r.TrainerName ?? '—')}
                                          </td>
                                          <td className="px-3 py-2.5 max-w-[200px]">
                                            <div className={`font-semibold truncate ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-800'}`} title={String(r.AccommodationName ?? '')}>
                                              {String(r.AccommodationName ?? '—')}
                                            </div>
                                          </td>
                                          <td className="px-3 py-2.5 whitespace-nowrap">
                                            {r.CityName
                                              ? <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400' : 'bg-purple-100 text-purple-700'}`}>{String(r.CityName)}</span>
                                              : '—'}
                                          </td>
                                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                            {r.RoomNo ? <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-mono text-[11px]">{String(r.RoomNo)}</span> : '—'}
                                          </td>
                                          <td className="px-3 py-2.5 whitespace-nowrap">
                                            {ci
                                              ? <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400' : 'bg-teal-50 border border-teal-200 text-teal-800'}`}>{fmtD(ci)}</span>
                                              : <span className="text-red-400 font-medium">—</span>}
                                          </td>
                                          <td className="px-3 py-2.5 whitespace-nowrap">
                                            {co
                                              ? <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400' : 'bg-orange-50 border border-orange-200 text-orange-800'}`}>{fmtD(co)}</span>
                                              : <span className="text-red-400 font-medium">—</span>}
                                          </td>
                                          <td className="px-3 py-2.5 text-center">
                                            {r.Nights != null
                                              ? <span className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400' : 'bg-teal-100 text-teal-700'}`}>{String(r.Nights)}</span>
                                              : '—'}
                                          </td>
                                          <td className="px-3 py-2.5 text-gray-500 max-w-[150px]">
                                            <div className={`truncate text-[11px] ${isCancelled ? 'line-through text-gray-400' : ''}`} title={String(r.StayDates ?? '')}>
                                              {r.StayDates ? String(r.StayDates) : (ci && co ? `${fmtD(ci)} → ${fmtD(co)}` : '—')}
                                            </div>
                                          </td>
                                          <td className="px-3 py-2.5 whitespace-nowrap">
                                            {isCancelled
                                              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold text-[10px]">✕ Cancelled</span>
                                              : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold text-[10px]">✓ Active</span>}
                                          </td>
                                          <td className="px-3 py-2.5">
                                            {pdfUrl
                                              ? <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-semibold transition-colors">
                                                  ↗ PDF
                                                </a>
                                              : <span className="text-gray-300 text-[11px]">No PDF</span>}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 6. Travel Bills — Step 7 replica: manual line items + PMS flights combined */}
                {(() => {
                  const travelItems = claimLineItems.filter(li =>
                    li.expenseType === 'TA' || li.expenseType === 'Cab'
                  );
                  const open = summaryOpen.travel;
                  const fmtD = (iso: string) => {
                    if (!iso) return '—';
                    const d = new Date(iso);
                    if (isNaN(d.getTime())) return iso;
                    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                  };
                  const fmtAmt = (amt: number, cur: string) =>
                    cur === 'INR' ? `₹${amt.toLocaleString('en-IN')}` : `${cur} ${amt.toLocaleString('en-IN')}`;
                  const journeyFrom = (desc: string) => {
                    const m = desc.match(/^([^:]+):/);
                    return m ? m[1].trim() : '';
                  };
                  const distFrom = (desc: string) => {
                    const m = desc.match(/\(([^)]+km[^)]*)\)/i);
                    return m ? m[1].trim() : '';
                  };
                  const typeColor = (t: string) => {
                    const tl = (t ?? '').toLowerCase();
                    if (tl === 'flight') return 'bg-blue-100 text-blue-700';
                    if (tl === 'train') return 'bg-green-100 text-green-700';
                    if (tl === 'cab' || tl === 'taxi') return 'bg-amber-100 text-amber-700';
                    if (tl === 'bus') return 'bg-orange-100 text-orange-700';
                    return 'bg-gray-100 text-gray-600';
                  };
                  // Totals from effective items (with HR overrides applied)
                  const inrTotal = effectiveTravelItemsFinal.filter(li => li.currency === 'INR').reduce((s, li) => s + li.claimedAmount, 0);
                  const foreignMap: Record<string, number> = {};
                  effectiveTravelItemsFinal.filter(li => li.currency !== 'INR').forEach(li => {
                    foreignMap[li.currency] = (foreignMap[li.currency] ?? 0) + li.claimedAmount;
                  });
                  const approvedTotal = effectiveTravelItemsFinal.reduce((s, li) => s + (li.approvedAmount ?? 0), 0);
                  const byType: Record<string, number> = {};
                  effectiveTravelItemsFinal.forEach(li => { const t = li.expenseSubType ?? li.expenseType; byType[t] = (byType[t] ?? 0) + 1; });
                  summaryFlights.forEach(f => { const t = String(f.transport_type ?? 'Flight'); byType[t] = (byType[t] ?? 0) + 1; });
                  const totalCount = effectiveTravelItemsFinal.length + summaryFlights.length;
                  const BASE_URL = 'https://api.koenig-solutions.com';
                  const toUrl = (p: unknown) => {
                    if (!p) return null;
                    const s = String(p);
                    return s.startsWith('http') ? s : `${BASE_URL}${s.startsWith('/') ? '' : '/'}${s}`;
                  };
                  return (
                    <div className="border border-indigo-100 rounded-lg overflow-hidden">
                      <button onClick={() => setSummaryOpen(p => ({ ...p, travel: !p.travel }))}
                        className="w-full flex items-center justify-between px-4 py-3 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                        <span className="text-sm font-semibold text-indigo-800">🚗 Travel Bills</span>
                        <span className="text-indigo-500 text-xs flex items-center gap-2">
                          {totalCount > 0
                            ? <span className="font-bold text-indigo-700">{totalCount} record{totalCount !== 1 ? 's' : ''}</span>
                            : <span className="text-gray-400">No bills submitted</span>}
                          {inrTotal > 0 && <span className="font-bold text-green-700">₹{inrTotal.toLocaleString('en-IN')}</span>}
                          {open ? '▲' : '▼'}
                        </span>
                      </button>
                      {open && (
                        <div>
                          {totalCount === 0 ? (
                            <div className="px-4 py-4 space-y-1">
                              <p className="text-xs font-semibold text-gray-500">No manual travel bills submitted</p>
                              <p className="text-xs text-gray-400">
                                {(claim as unknown as { claimId?: string })?.claimId?.startsWith('claim_')
                                  ? `This claim was submitted via the legacy system. Individual travel bill breakdown is unavailable. Total claimed: ₹${((claim as unknown as { totalClaimedAmount?: number })?.totalClaimedAmount ?? 0).toLocaleString('en-IN')}.`
                                  : 'The trainer submitted a DA-only claim. No manual travel bills (cab, flight, train) were entered in Step 7 of the submission form.'}
                              </p>
                            </div>
                          ) : (
                            <>
                              {/* Summary mini-cards */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 pt-4 pb-3">
                                {[
                                  { label: 'Total Records',  value: totalCount,  sub: `${travelItems.length} manual · ${summaryFlights.length} PMS`, color: 'bg-indigo-50 text-indigo-700 border border-indigo-100' },
                                  { label: 'Total Claimed',  value: inrTotal > 0 ? `₹${inrTotal.toLocaleString('en-IN')}` : '—', sub: 'manual bills only', color: 'bg-green-50 text-green-700 border border-green-100' },
                                  { label: 'Approved',       value: approvedTotal > 0 ? `₹${approvedTotal.toLocaleString('en-IN')}` : '—', sub: 'manual bills only', color: 'bg-blue-50 text-blue-700 border border-blue-100' },
                                  { label: 'Transport Types',value: Object.keys(byType).length, sub: Object.keys(byType).join(', ') || '—', color: 'bg-purple-50 text-purple-700 border border-purple-100' },
                                ].map(c => (
                                  <div key={c.label} className={`rounded-xl px-4 py-3 ${c.color}`}>
                                    <p className="text-xs font-medium opacity-70">{c.label}</p>
                                    <p className={`font-bold mt-0.5 ${typeof c.value === 'number' ? 'text-2xl' : 'text-sm'}`}>{c.value}</p>
                                    <p className="text-[10px] opacity-60 mt-0.5 truncate">{c.sub}</p>
                                  </div>
                                ))}
                              </div>

                              {/* ── PMS Flights sub-section (shown when flights exist) ── */}
                              {summaryFlights.length > 0 && (
                                <div className="mx-4 mb-3 rounded-xl border border-blue-200 overflow-hidden">
                                  <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100">
                                    <span className="text-xs font-semibold text-blue-800">✈️ {summaryFlights.length} PMS Flight{summaryFlights.length !== 1 ? 's' : ''} (Koenig PMS · auto-fetched)</span>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full text-xs">
                                      <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                          {['Trip ID','Type','Flight No.','Airline','From','To','Departure','Status','Ticket'].map(h => (
                                            <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold whitespace-nowrap text-[11px]">{h}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100 bg-white">
                                        {summaryFlights.map((f, idx) => {
                                          const isCancelled = f.Is_cancelled === 'Yes';
                                          const depDate = parseDT(String(f.departure_date ?? ''));
                                          const transport = f.transport_type ? String(f.transport_type).trim() : 'Flight';
                                          const ticketUrl = toUrl(f.ticket_path);
                                          return (
                                            <tr key={idx} className={isCancelled ? 'bg-red-50/50 opacity-70' : idx % 2 === 0 ? 'bg-white hover:bg-blue-50/30' : 'bg-gray-50/40 hover:bg-blue-50/30'}>
                                              <td className="px-3 py-2 text-gray-400 font-mono text-[11px]">{String(f.trip_ID ?? '—')}</td>
                                              <td className="px-3 py-2">
                                                <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${typeColor(transport)}`}>{transport}</span>
                                              </td>
                                              <td className={`px-3 py-2 font-semibold whitespace-nowrap ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{String(f.flight_number ?? '—')}</td>
                                              <td className="px-3 py-2 whitespace-nowrap">
                                                {f.airlines_name
                                                  ? <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400' : 'bg-blue-100 text-blue-700'}`}>{String(f.airlines_name)}</span>
                                                  : '—'}
                                              </td>
                                              <td className={`px-3 py-2 font-medium whitespace-nowrap ${isCancelled ? 'text-gray-400' : 'text-gray-800'}`}>{String(f.from_city ?? '—')}</td>
                                              <td className={`px-3 py-2 font-medium whitespace-nowrap ${isCancelled ? 'text-gray-400' : 'text-gray-800'}`}>{String(f.to_city ?? '—')}</td>
                                              <td className="px-3 py-2 whitespace-nowrap">
                                                {depDate ? <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${isCancelled ? 'bg-gray-100 text-gray-400' : 'bg-teal-50 border border-teal-200 text-teal-800'}`}>{fmtD(depDate)}</span> : '—'}
                                              </td>
                                              <td className="px-3 py-2 whitespace-nowrap">
                                                {isCancelled
                                                  ? <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold text-[10px]">✕ Cancelled</span>
                                                  : <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold text-[10px]">✓ Active</span>}
                                              </td>
                                              <td className="px-3 py-2">
                                                {ticketUrl
                                                  ? <a href={ticketUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-600 text-[11px] font-medium">↗ View</a>
                                                  : <span className="text-gray-300 text-[11px]">—</span>}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* ── Manually submitted travel bills ── */}
                              {effectiveTravelItemsFinal.length > 0 && (
                                <div className="overflow-x-auto border-t border-gray-200">
                                  <div className="flex items-center px-4 py-2 bg-indigo-50 border-b border-indigo-100">
                                    <span className="text-xs font-semibold text-indigo-800">🚗 {effectiveTravelItemsFinal.length} manually submitted bill{effectiveTravelItemsFinal.length !== 1 ? 's' : ''} · sorted by date</span>
                                  </div>
                                  <table className="min-w-full text-xs">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                      <tr>
                                        {['Date','Journey Type','Type','From','To', ...(currentUser.role !== 'Trainer' ? ['Map'] : []),'Distance','Claimed','Eligible','Approved','Status','Receipt', ...(currentUser.role === 'HRAdmin' ? ['HR Override'] : [])].map(h => (
                                          <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold whitespace-nowrap text-[11px]">{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                      {effectiveTravelItemsFinal.map((li, idx) => {
                                          const ov       = taHrOverrides[li.lineItemId];
                                          const journey  = journeyFrom(li.description);
                                          const dist     = distFrom(li.description);
                                          const tType    = li.expenseSubType ?? li.expenseType;
                                          const eligible = li.eligibleAmount ?? li.claimedAmount;
                                          const approved = li.approvedAmount ?? 0;
                                          const isApproved = approved > 0 && approved >= eligible;
                                          const isReduced  = approved > 0 && approved < eligible;
                                          const isEditing  = taEditIdx === idx && currentUser.role === 'HRAdmin';
                                          const alreadyPaidBill = isPaidElsewhere(li) ? paidNonDaItems.get(nonDaPaidKey(li)) : undefined;

                                          if (isEditing) {
                                            return (
                                              <tr key={idx} className="bg-amber-50 border-l-4 border-amber-400">
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                  <span className="px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-800 font-semibold text-[11px]">{fmtD(li.date ?? '')}</span>
                                                </td>
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                  {journey ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">{journey}</span> : <span className="text-gray-400">—</span>}
                                                </td>
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                  <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${typeColor(tType)}`}>{tType || '—'}</span>
                                                </td>
                                                <td className="px-3 py-2 font-medium whitespace-nowrap text-gray-800">{li.fromLocation || '—'}</td>
                                                <td className="px-3 py-2 font-medium whitespace-nowrap text-gray-800">{li.toLocation || '—'}</td>
                                                {currentUser.role !== 'Trainer' && (
                                                  <td className="px-3 py-2 whitespace-nowrap">
                                                    {li.fromLocation && li.toLocation ? (
                                                      <button
                                                        onClick={() => setRouteModal({ from: li.fromLocation!, to: li.toLocation! })}
                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-semibold hover:bg-indigo-100"
                                                        title="View route & fare estimate"
                                                      >
                                                        🗺️ Route
                                                      </button>
                                                    ) : <span className="text-gray-300 text-[11px]">—</span>}
                                                  </td>
                                                )}
                                                <td className="px-3 py-2 text-gray-500 whitespace-nowrap text-[11px]">{dist || '—'}</td>
                                                {/* Editable currency + amount */}
                                                <td className="px-3 py-2" colSpan={3}>
                                                  <div className="flex items-center gap-1.5">
                                                    <select
                                                      value={taEditValues.currency}
                                                      onChange={e => setTaEditValues(v => ({ ...v, currency: e.target.value }))}
                                                      className="border border-amber-300 rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                                                    >
                                                      <option value="INR">INR (₹)</option>
                                                      <option value="USD">USD</option>
                                                      <option value="AED">AED</option>
                                                      <option value="EUR">EUR</option>
                                                      <option value="GBP">GBP</option>
                                                      <option value="SGD">SGD</option>
                                                      <option value="AUD">AUD</option>
                                                      <option value="CAD">CAD</option>
                                                    </select>
                                                    <input
                                                      type="number"
                                                      min={0}
                                                      value={taEditValues.amount}
                                                      onChange={e => setTaEditValues(v => ({ ...v, amount: Number(e.target.value) }))}
                                                      className="w-24 border border-amber-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                                                    />
                                                    <span className="text-amber-700 font-bold text-xs">
                                                      {taEditValues.currency === 'INR' ? `₹${taEditValues.amount}` : `${taEditValues.currency} ${taEditValues.amount}`}
                                                    </span>
                                                  </div>
                                                </td>
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold text-[10px]">Pending</span>
                                                </td>
                                                <td className="px-3 py-2">
                                                  <div className="flex items-center gap-1.5">
                                                    <button
                                                      onClick={() => {
                                                        const next = { ...taHrOverrides, [li.lineItemId]: { currency: taEditValues.currency, amount: taEditValues.amount } };
                                                        setTaHrOverrides(next);
                                                        persistHrOverrideField('taHrOverrides', next);
                                                        setTaEditIdx(null);
                                                      }}
                                                      className="px-2.5 py-1 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-700"
                                                    >Save</button>
                                                    <button
                                                      onClick={() => setTaEditIdx(null)}
                                                      className="px-2.5 py-1 rounded bg-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-300"
                                                    >Cancel</button>
                                                  </div>
                                                </td>
                                              </tr>
                                            );
                                          }

                                          return (
                                            <tr key={idx} className={`${alreadyPaidBill ? 'bg-gray-100 opacity-60' : ov ? 'bg-amber-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} hover:bg-indigo-50/30`}>
                                              <td className="px-3 py-2.5 whitespace-nowrap">
                                                <span className={`px-2 py-0.5 rounded-md border font-semibold text-[11px] ${alreadyPaidBill ? 'bg-gray-100 border-gray-300 text-gray-400 line-through' : 'bg-teal-50 border-teal-200 text-teal-800'}`}>{fmtD(li.date ?? '')}</span>
                                              </td>
                                              <td className="px-3 py-2.5 whitespace-nowrap">
                                                {journey ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">{journey}</span> : <span className="text-gray-400">—</span>}
                                              </td>
                                              <td className="px-3 py-2.5 whitespace-nowrap">
                                                <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${typeColor(tType)}`}>{tType || '—'}</span>
                                              </td>
                                              <td className="px-3 py-2.5 font-medium whitespace-nowrap text-gray-800">{li.fromLocation || '—'}</td>
                                              <td className="px-3 py-2.5 font-medium whitespace-nowrap text-gray-800">{li.toLocation || '—'}</td>
                                              {currentUser.role !== 'Trainer' && (
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                  {li.fromLocation && li.toLocation ? (
                                                    <button
                                                      onClick={() => setRouteModal({ from: li.fromLocation!, to: li.toLocation! })}
                                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-semibold hover:bg-indigo-100"
                                                      title="View route & fare estimate"
                                                    >
                                                      🗺️ Route
                                                    </button>
                                                  ) : <span className="text-gray-300 text-[11px]">—</span>}
                                                </td>
                                              )}
                                              <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap text-[11px]">{dist || '—'}</td>
                                              <td className={`px-3 py-2.5 whitespace-nowrap font-semibold ${alreadyPaidBill ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                                {fmtAmt(li.claimedAmount, li.currency)}
                                                {ov && !alreadyPaidBill && <span className="ml-1 text-[10px] text-amber-600 font-semibold">(HR)</span>}
                                              </td>
                                              <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">{eligible > 0 ? fmtAmt(eligible, li.currency) : '—'}</td>
                                              <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-green-700">{approved > 0 ? fmtAmt(approved, li.currency) : '—'}</td>
                                              <td className="px-3 py-2.5 whitespace-nowrap">
                                                {alreadyPaidBill
                                                  ? <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 font-semibold text-[10px]">Already Paid — {alreadyPaidBill}</span>
                                                  : isApproved
                                                  ? <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold text-[10px]">✓ Approved</span>
                                                  : isReduced
                                                  ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold text-[10px]">~ Reduced</span>
                                                  : <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold text-[10px]">Pending</span>}
                                              </td>
                                              <td className="px-3 py-2.5 whitespace-nowrap">
                                                {(() => {
                                                  const src = li.receiptData || li.receiptUrl;
                                                  const fname = li.receiptFileName || 'receipt';
                                                  const label = fname.length > 14 ? fname.slice(0, 12) + '…' : fname;
                                                  if (src) return (
                                                    <button onClick={() => setReceiptPreview({ url: src, name: fname })}
                                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-semibold hover:bg-blue-100"
                                                      title={fname}>
                                                      📎 {label}
                                                    </button>
                                                  );
                                                  if (fname && fname !== 'receipt') return (
                                                    <button onClick={() => alert(`Receipt "${fname}" was uploaded by the trainer but is not yet synced to the server.\n\nAsk the trainer to open their dashboard once to sync all receipts.`)}
                                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-50 border border-gray-300 text-gray-500 text-[10px] font-semibold hover:bg-gray-100"
                                                      title="Click for info">
                                                      📄 {label}
                                                    </button>
                                                  );
                                                  return <span className="text-gray-300 text-[10px]">—</span>;
                                                })()}
                                              </td>
                                              {currentUser.role === 'HRAdmin' && (
                                                <td className="px-3 py-2.5">
                                                  <div className="flex items-center gap-1.5">
                                                    {(() => {
                                                      const src = li.receiptData || li.receiptUrl;
                                                      const fname = li.receiptFileName || 'receipt';
                                                      if (!src) return null;
                                                      return (
                                                        <a
                                                          href={src}
                                                          download={fname}
                                                          className="flex items-center gap-1 px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-700 text-xs font-medium transition-colors"
                                                          title={`Download ${fname}`}
                                                        >
                                                          ⬇️ Download
                                                        </a>
                                                      );
                                                    })()}
                                                    {!alreadyPaidBill && (
                                                    <button
                                                      onClick={() => {
                                                        setTaEditIdx(idx);
                                                        setTaEditValues({ currency: ov?.currency ?? li.currency, amount: ov?.amount ?? li.claimedAmount });
                                                      }}
                                                      className="flex items-center gap-1 px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:bg-amber-50 hover:border-amber-400 hover:text-amber-700 text-xs font-medium transition-colors"
                                                      title="Override amount for this bill"
                                                    >
                                                      ✏️ Edit
                                                    </button>
                                                    )}
                                                  </div>
                                                </td>
                                              )}
                                            </tr>
                                          );
                                        })}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* Footer totals */}
                              <div className="px-5 py-4 bg-indigo-50 border-t-2 border-indigo-200">
                                <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Manual Bills:</span>
                                  {inrTotal > 0 && <span className="text-base font-bold text-indigo-700">₹{inrTotal.toLocaleString('en-IN')}</span>}
                                  {Object.entries(foreignMap).map(([cur, amt]) => (
                                    <span key={cur} className="text-base font-bold text-blue-700">{cur} {amt.toLocaleString('en-IN')}</span>
                                  ))}
                                  {inrTotal === 0 && Object.keys(foreignMap).length === 0 && <span className="text-gray-400 text-sm">No manual bills claimed</span>}
                                  {approvedTotal > 0 && <span className="text-sm font-semibold text-green-700">· Approved: ₹{approvedTotal.toLocaleString('en-IN')}</span>}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 7. Miscellaneous Expenses — Step 8 exact replica */}
                {(() => {
                  // Use effectiveMiscItemsFinal so HR overrides and bestAmt are reflected
                  const miscItems = effectiveMiscItemsFinal;
                  const open = summaryOpen.misc;
                  const fmtD = (iso: string) => {
                    if (!iso) return '—';
                    const d = new Date(iso);
                    if (isNaN(d.getTime())) return iso;
                    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                  };
                  const fmtAmt = (amt: number, cur: string) =>
                    cur === 'INR' ? `₹${amt.toLocaleString('en-IN')}` : `${cur} ${amt.toLocaleString('en-IN')}`;
                  // Description format: "Other: Internet charges" — remarks is after ":"
                  const remarksFrom = (desc: string) => {
                    const idx = desc.indexOf(':');
                    return idx >= 0 ? desc.slice(idx + 1).trim() : desc;
                  };
                  // Use bestAmt so rows with claimedAmount=0 but eligibleAmount>0 show correct values
                  const inrTotal = miscItems.filter(li => (li.currency ?? 'INR') === 'INR').reduce((s, li) => s + bestAmt(li), 0);
                  const foreignMap: Record<string, number> = {};
                  miscItems.filter(li => li.currency && li.currency !== 'INR').forEach(li => {
                    foreignMap[li.currency] = (foreignMap[li.currency] ?? 0) + bestAmt(li);
                  });
                  const approvedTotal = miscItems.reduce((s, li) => s + (li.approvedAmount ?? 0), 0);
                  const byType: Record<string, number> = {};
                  miscItems.forEach(li => { const t = li.expenseSubType ?? 'Other'; byType[t] = (byType[t] ?? 0) + 1; });
                  return (
                    <div className="border border-rose-100 rounded-lg overflow-hidden">
                      <button onClick={() => setSummaryOpen(p => ({ ...p, misc: !p.misc }))}
                        className="w-full flex items-center justify-between px-4 py-3 bg-rose-50 hover:bg-rose-100 transition-colors">
                        <span className="text-sm font-semibold text-rose-800">🧾 Miscellaneous Expenses</span>
                        <span className="text-rose-500 text-xs flex items-center gap-2">
                          {miscItems.length > 0
                            ? <span className="font-bold text-rose-700">{miscItems.length} item{miscItems.length !== 1 ? 's' : ''}</span>
                            : <span className="text-gray-400">No expenses submitted</span>}
                          {inrTotal > 0 && <span className="font-bold text-green-700">₹{inrTotal.toLocaleString('en-IN')}</span>}
                          {open ? '▲' : '▼'}
                        </span>
                      </button>
                      {open && (
                        <div>
                          {miscItems.length === 0 ? (
                            <div className="px-4 py-4 space-y-1">
                              <p className="text-xs font-semibold text-gray-500">No miscellaneous expenses submitted</p>
                              <p className="text-xs text-gray-400">
                                {(claim as unknown as { claimId?: string })?.claimId?.startsWith('claim_')
                                  ? 'This claim was submitted via the legacy system. Individual expense breakdown is unavailable.'
                                  : 'The trainer did not add any miscellaneous expenses (internet, visa, tips, etc.) in Step 8 of the submission form.'}
                              </p>
                            </div>
                          ) : (
                            <>
                              {/* Summary mini-cards */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 pt-4 pb-3">
                                {[
                                  { label: 'Total Items',   value: miscItems.length,   color: 'bg-rose-50 text-rose-700 border border-rose-100' },
                                  { label: 'Total Claimed', value: inrTotal > 0 ? `₹${inrTotal.toLocaleString('en-IN')}` : '—', color: 'bg-green-50 text-green-700 border border-green-100' },
                                  { label: 'Approved',      value: approvedTotal > 0 ? `₹${approvedTotal.toLocaleString('en-IN')}` : '—', color: 'bg-blue-50 text-blue-700 border border-blue-100' },
                                  { label: 'Expense Types', value: Object.keys(byType).length, color: 'bg-purple-50 text-purple-700 border border-purple-100' },
                                ].map(c => (
                                  <div key={c.label} className={`rounded-xl px-4 py-3 ${c.color}`}>
                                    <p className="text-xs font-medium opacity-70">{c.label}</p>
                                    <p className={`font-bold mt-0.5 ${typeof c.value === 'number' ? 'text-2xl' : 'text-sm'}`}>{c.value}</p>
                                  </div>
                                ))}
                              </div>
                              {/* Misc table — exact Step 8 columns: Date, Type, Currency, Amount, Remarks, Receipt, Status */}
                              <div className="overflow-x-auto border-t border-gray-200">
                                <div className="flex items-center px-4 py-2 bg-rose-50 border-b border-rose-100">
                                  <span className="text-xs font-semibold text-rose-800">🧾 {miscItems.length} misc expense{miscItems.length !== 1 ? 's' : ''} submitted with this claim · sorted by date</span>
                                </div>
                                <table className="min-w-full text-xs">
                                  <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                      {['Date','Expense Type','Currency','Claimed','Remarks','Eligible','Approved','Status','Receipt', currentUser.role === 'HRAdmin' ? 'HR Edit' : ''].filter(Boolean).map(h => (
                                        <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold whitespace-nowrap text-[11px]">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100 bg-white">
                                    {effectiveMiscItemsFinal.map((li, idx) => {
                                        const ov       = miscHrOverrides[li.lineItemId];
                                        const expType  = li.expenseSubType ?? 'Other';
                                        const remarks  = remarksFrom(li.description);
                                        const eligible = li.eligibleAmount ?? li.claimedAmount;
                                        const approved = li.approvedAmount ?? 0;
                                        const isApproved = approved > 0 && approved >= eligible;
                                        const isReduced  = approved > 0 && approved < eligible;
                                        const isEditing  = miscEditIdx === idx && currentUser.role === 'HRAdmin';
                                        const alreadyPaidBill = isPaidElsewhere(li) ? paidNonDaItems.get(nonDaPaidKey(li)) : undefined;
                                        return (
                                          <tr key={idx} className={`${alreadyPaidBill ? 'bg-gray-100 opacity-60' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} ${ov && !alreadyPaidBill ? 'ring-1 ring-inset ring-amber-300' : ''} hover:bg-rose-50/30`}>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                              <span className={`px-2 py-0.5 rounded-md border font-semibold text-[11px] ${alreadyPaidBill ? 'bg-gray-100 border-gray-300 text-gray-400 line-through' : 'bg-teal-50 border-teal-200 text-teal-800'}`}>{fmtD(li.date ?? '')}</span>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">{expType}</span>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                              {isEditing ? (
                                                <select value={miscEditValues.currency} onChange={e => setMiscEditValues(v => ({ ...v, currency: e.target.value }))}
                                                  className="border border-amber-300 rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400">
                                                  {['INR','USD','AED','EUR','GBP','SGD','AUD','CAD','JPY','SAR','QAR','KWD'].map(c => <option key={c}>{c}</option>)}
                                                </select>
                                              ) : (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">{li.currency || 'INR'}</span>
                                              )}
                                            </td>
                                            <td className={`px-3 py-2.5 whitespace-nowrap font-semibold ${alreadyPaidBill ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                              {isEditing ? (
                                                <input type="number" min={0} value={miscEditValues.amount}
                                                  onChange={e => setMiscEditValues(v => ({ ...v, amount: Number(e.target.value) }))}
                                                  className="w-24 border border-amber-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
                                              ) : (
                                                <span className={ov && !alreadyPaidBill ? 'text-amber-700 font-bold' : ''}>{fmtAmt(li.claimedAmount, li.currency)}</span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2.5 max-w-[200px]">
                                              <div className="truncate text-gray-600 text-[11px]" title={remarks}>{remarks || '—'}</div>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">{eligible > 0 ? fmtAmt(eligible, li.currency) : '—'}</td>
                                            <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-green-700">{approved > 0 ? fmtAmt(approved, li.currency) : '—'}</td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                              {alreadyPaidBill
                                                ? <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 font-semibold text-[10px]">Already Paid — {alreadyPaidBill}</span>
                                                : isApproved
                                                ? <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold text-[10px]">✓ Approved</span>
                                                : isReduced
                                                ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold text-[10px]">~ Reduced</span>
                                                : <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold text-[10px]">Pending</span>}
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                              {(() => {
                                                const src = li.receiptData || li.receiptUrl;
                                                const fname = li.receiptFileName || 'receipt';
                                                const label = fname.length > 14 ? fname.slice(0, 12) + '…' : fname;
                                                if (src) return (
                                                  <button onClick={() => setReceiptPreview({ url: src, name: fname })}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-semibold hover:bg-blue-100"
                                                    title={fname}>
                                                    📎 {label}
                                                  </button>
                                                );
                                                if (fname && fname !== 'receipt') return (
                                                  <button onClick={() => alert(`Receipt "${fname}" was uploaded by the trainer but is not yet synced to the server.\n\nAsk the trainer to open their dashboard once to sync all receipts.`)}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-50 border border-gray-300 text-gray-500 text-[10px] font-semibold hover:bg-gray-100"
                                                    title="Click for info">
                                                    📄 {label}
                                                  </button>
                                                );
                                                return <span className="text-gray-300 text-[10px]">—</span>;
                                              })()}
                                            </td>
                                            {currentUser.role === 'HRAdmin' && (
                                              <td className="px-3 py-2.5 whitespace-nowrap">
                                                {isEditing ? (
                                                  <div className="flex items-center gap-1">
                                                    <button onClick={() => {
                                                        const next = { ...miscHrOverrides, [li.lineItemId]: { currency: miscEditValues.currency, amount: miscEditValues.amount } };
                                                        setMiscHrOverrides(next);
                                                        persistHrOverrideField('miscHrOverrides', next);
                                                        setMiscEditIdx(null);
                                                      }}
                                                      className="px-2 py-1 rounded bg-green-600 text-white text-[10px] font-semibold hover:bg-green-700">Save</button>
                                                    <button onClick={() => setMiscEditIdx(null)}
                                                      className="px-2 py-1 rounded bg-gray-200 text-gray-600 text-[10px] font-semibold hover:bg-gray-300">Cancel</button>
                                                  </div>
                                                ) : (
                                                  <div className="flex items-center gap-1">
                                                    {(() => {
                                                      const src = li.receiptData || li.receiptUrl;
                                                      const fname = li.receiptFileName || 'receipt';
                                                      if (!src) return null;
                                                      return (
                                                        <a href={src} download={fname} title={`Download ${fname}`}
                                                          className="p-1 rounded hover:bg-indigo-100 text-indigo-600 transition-colors">
                                                          ⬇️
                                                        </a>
                                                      );
                                                    })()}
                                                    {!alreadyPaidBill && (
                                                    <button onClick={() => { setMiscEditIdx(idx); setMiscEditValues({ currency: li.currency || 'INR', amount: li.claimedAmount }); }}
                                                      title="Edit amount" className="p-1 rounded hover:bg-amber-100 text-amber-600 transition-colors">
                                                      ✏️
                                                    </button>
                                                    )}
                                                    {ov && !alreadyPaidBill && (
                                                      <button onClick={() => {
                                                          const next = { ...miscHrOverrides };
                                                          delete next[li.lineItemId];
                                                          setMiscHrOverrides(next);
                                                          persistHrOverrideField('miscHrOverrides', next);
                                                        }}
                                                        title="Reset to original" className="p-1 rounded hover:bg-red-100 text-red-500 transition-colors text-[10px]">✕</button>
                                                    )}
                                                  </div>
                                                )}
                                              </td>
                                            )}
                                          </tr>
                                        );
                                      })}
                                  </tbody>
                                </table>
                              </div>
                              {/* Footer totals */}
                              <div className="px-5 py-4 bg-rose-50 border-t-2 border-rose-200">
                                <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Misc Expenses:</span>
                                  {inrTotal > 0 && <span className="text-base font-bold text-rose-700">₹{inrTotal.toLocaleString('en-IN')}</span>}
                                  {Object.entries(foreignMap).map(([cur, amt]) => (
                                    <span key={cur} className="text-base font-bold text-blue-700">{cur} {amt.toLocaleString('en-IN')}</span>
                                  ))}
                                  {approvedTotal > 0 && <span className="text-sm font-semibold text-green-700 ml-2">· Approved: ₹{approvedTotal.toLocaleString('en-IN')}</span>}
                                </div>
                              </div>
                            </>
                          )}

                          {/* Add a NEW misc expense to this already-submitted claim — restricted
                              to exempted trainers (viewing their own claim) and HR Admin/
                              SuperAdmin (on that trainer's behalf). See
                              MISC_POST_SUBMIT_EXEMPT_EMP_CODES. */}
                          {canAddMiscPostSubmit && (
                            <div className="px-4 py-4 border-t border-rose-100 bg-rose-50/40">
                              <p className="text-xs font-semibold text-rose-800 mb-3">➕ Add Miscellaneous Expense</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-[10px] text-gray-500 mb-1 font-semibold">Date</label>
                                  <input type="date" value={miscPostSubmitDraft.date}
                                    onChange={e => setMiscPostSubmitDraft(v => ({ ...v, date: e.target.value }))}
                                    className="w-full border border-rose-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400" />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-gray-500 mb-1 font-semibold">Expense Type</label>
                                  <input type="text" value={miscPostSubmitDraft.expenseType}
                                    onChange={e => setMiscPostSubmitDraft(v => ({ ...v, expenseType: e.target.value }))}
                                    placeholder="e.g. Internet, Visa, Tips"
                                    className="w-full border border-rose-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400" />
                                </div>
                                <div className="flex gap-1.5">
                                  <select value={miscPostSubmitDraft.currency}
                                    onChange={e => setMiscPostSubmitDraft(v => ({ ...v, currency: e.target.value }))}
                                    className="border border-rose-300 rounded px-1.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400">
                                    <option value="INR">INR ₹</option>
                                    <option value="USD">USD</option>
                                    <option value="AED">AED</option>
                                    <option value="EUR">EUR</option>
                                    <option value="GBP">GBP</option>
                                  </select>
                                  <input type="number" min={0} value={miscPostSubmitDraft.amount || ''}
                                    onChange={e => setMiscPostSubmitDraft(v => ({ ...v, amount: Number(e.target.value) }))}
                                    placeholder="Amount"
                                    className="w-full border border-rose-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400" />
                                </div>
                                <div className="col-span-2 sm:col-span-2">
                                  <label className="block text-[10px] text-gray-500 mb-1 font-semibold">Remarks</label>
                                  <input type="text" value={miscPostSubmitDraft.remarks}
                                    onChange={e => setMiscPostSubmitDraft(v => ({ ...v, remarks: e.target.value }))}
                                    placeholder="Brief description"
                                    className="w-full border border-rose-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400" />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-gray-500 mb-1 font-semibold">Receipt (optional)</label>
                                  <input type="file" accept="image/*,.pdf"
                                    onChange={async e => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      const data = await compressReceiptForPostSubmit(file);
                                      setMiscPostSubmitDraft(v => ({ ...v, receiptData: data, receiptName: file.name }));
                                    }}
                                    className="w-full text-[10px] text-gray-500" />
                                  {miscPostSubmitDraft.receiptName && (
                                    <p className="text-[10px] text-green-600 mt-0.5 truncate">✓ {miscPostSubmitDraft.receiptName}</p>
                                  )}
                                </div>
                              </div>
                              <div className="mt-3 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={addMiscExpensePostSubmit}
                                  disabled={miscPostSubmitSaving || !miscPostSubmitDraft.date || !miscPostSubmitDraft.amount}
                                  className="px-3 py-1.5 rounded bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {miscPostSubmitSaving ? 'Adding…' : '+ Add Expense'}
                                </button>
                                {miscPostSubmitMsg && (
                                  <span className={`text-xs font-medium ${miscPostSubmitMsg.startsWith('✅') ? 'text-green-600' : 'text-red-600'}`}>
                                    {miscPostSubmitMsg}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Live Final Summary strip — visible to HR without scrolling up ── */}
                {currentUser.role === 'HRAdmin' && showLiveAmounts && (
                  <div className="mt-4 rounded-xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4">
                    <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-widest mb-3">📊 Live Final Summary (reflects your edits above)</p>
                    <div className="flex flex-wrap gap-3">
                      {liveTATotalINR > 0 && (
                        <div className="flex items-center gap-2 bg-sky-100 border border-sky-200 rounded-lg px-3 py-2">
                          <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                          <span className="text-xs text-gray-600">Cab / Travel</span>
                          <span className="text-sm font-bold text-sky-700">₹{liveTATotalINR.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {liveMiscTotalINR > 0 && (
                        <div className="flex items-center gap-2 bg-rose-100 border border-rose-200 rounded-lg px-3 py-2">
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                          <span className="text-xs text-gray-600">Miscellaneous</span>
                          <span className="text-sm font-bold text-rose-700">₹{liveMiscTotalINR.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {(() => {
                        // Same "Already Paid — Same Assignment ID" adjustment applied to the
                        // Amount Summary card and the Net Payable banner above must also reduce
                        // THIS strip's figures — it was reading the raw liveNetPayableINR /
                        // liveRecoverableINR directly, so approving off of this box alone still
                        // showed the full pre-deduction amount even after HR applied a deduction.
                        const netAfterDeduction = liveNetPayableINR - alreadyPaidDeduction;
                        const recoverableAfterDeduction = liveRecoverableINR + Math.max(0, -netAfterDeduction);
                        const payableAfterDeduction = Math.max(0, netAfterDeduction);
                        return recoverableAfterDeduction > 0 ? (
                          <div className="flex items-center gap-2 bg-red-600 rounded-lg px-3 py-2">
                            <span className="text-xs font-semibold text-red-100">RECOVERABLE FROM TRAINER</span>
                            <span className="text-base font-extrabold text-white">₹{recoverableAfterDeduction.toLocaleString('en-IN')}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 bg-emerald-600 rounded-lg px-3 py-2">
                            <span className="text-xs font-semibold text-emerald-100">NET PAYABLE</span>
                            <span className="text-base font-extrabold text-white">₹{payableAfterDeduction.toLocaleString('en-IN')}</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Remarks */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Remarks</h3>
              <RemarksPanel
                remarks={[]}
                currentUserRole={currentUser.role}
                currentUserId={currentUser.id}
              />
            </div>

          </div>
        )}

        {/* Travel */}
        {activeTab === 'travel' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Travel Legs</h3>
            <TravelTimeline travelLegs={[]} showContinuityCheck />
          </div>
        )}

        {/* DA */}
        {activeTab === 'da' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">DA Day Breakdown</h3>
              <DADayBreakdown daRecords={[]} totalDA={0} showPolicyColumn />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Leave &amp; Resource Calendar</h3>
              <ResourceLeavePanel
                trainerId={claim.trainerName}
                startDate={claim.submittedAt ?? ''}
                endDate={claim.lastActionAt ?? ''}
                leaveRecords={[]}
                assignments={[]}
              />
            </div>
          </div>
        )}

        {/* Lodging */}
        {activeTab === 'lodging' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Hotel Stays</h3>
            <LodgingStaybackPanel hotelStays={[]} policyLimit={3500} />
          </div>
        )}

        {/* Cab */}
        {activeTab === 'cab' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Cab / Conveyance</h3>
            <CabConveyancePanel cabRecords={[]} policyLimit={1500} assignmentDates={[]} />
          </div>
        )}

        {/* Other */}
        {activeTab === 'other' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Other Expenses</h3>
            <p className="text-sm text-gray-400">No other expenses recorded for this claim.</p>
          </div>
        )}

        {/* Documents */}
        {activeTab === 'documents' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Attachments
              </h3>
              <span className="text-xs text-gray-400">{claimAttachments.length} receipt{claimAttachments.length !== 1 ? 's' : ''} uploaded</span>
            </div>
            {claimAttachments.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-gray-400">No attachments uploaded for this claim.</p>
                <p className="text-xs text-gray-300 mt-1">Trainer did not upload any receipts.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {claimAttachments.map(li => {
                  const fileName = li.receiptFileName || `${li.expenseType}-receipt`;
                  const src = li.receiptData || li.receiptUrl; // blob URL, base64, or permanent URL
                  const isUrl = src && src.startsWith('http');
                  const isPdf = src && (src.startsWith('data:application/pdf') || /\.pdf$/i.test(fileName));
                  const isImage = src && !isPdf && (isUrl || src.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName));
                  const expLabel = li.expenseType === 'TA' ? 'Travel' : li.expenseType === 'Other' ? 'Misc' : li.expenseType;
                  return (
                    <div key={li.lineItemId} className="border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-white">
                      {/* Preview area — clicking opens the preview modal */}
                      <div
                        className={`w-full h-44 bg-gray-50 flex items-center justify-center overflow-hidden border-b border-gray-100 ${src ? 'cursor-pointer' : ''}`}
                        onClick={() => src && setReceiptPreview({ url: src, name: fileName })}
                      >
                        {isImage && src ? (
                          <img src={src} alt={fileName} className="w-full h-full object-contain" />
                        ) : isPdf && src ? (
                          <div className="flex flex-col items-center gap-2 text-red-500">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                            <span className="text-xs font-medium">Click to view PDF</span>
                          </div>
                        ) : li.receiptUploaded ? (
                          <div className="flex flex-col items-center gap-2 text-gray-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                            <span className="text-xs">Receipt uploaded (older claim)</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-gray-300">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            <span className="text-xs">No preview</span>
                          </div>
                        )}
                      </div>
                      {/* Metadata */}
                      <div className="p-3">
                        <p className="text-xs font-semibold text-gray-700 truncate" title={fileName}>{fileName}</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate" title={li.description}>{li.description}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700">{expLabel}</span>
                          <span className="text-[10px] text-gray-400">{li.date}</span>
                          {src && (
                            <a
                              href={src}
                              download={isUrl ? undefined : fileName}
                              target={isUrl ? '_blank' : undefined}
                              rel="noopener noreferrer"
                              className="text-[10px] text-blue-600 hover:underline font-medium"
                            >
                              {isUrl ? 'Open' : 'Download'}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Timeline (expanded) */}
        {activeTab === 'timeline' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Full Status Timeline</h3>
            <ClaimTimeline
              statusHistory={adaptedHistory}
              currentStatus={claim.status as ClaimStatus}
            />
          </div>
        )}

        {/* Audit Log */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Audit Log</h3>
            <AuditTimeline
              auditLogs={claimHistory.map((h, _idx) => ({
                logId: `audit-${h.claimId}`,
                claimId: h.claimId,
                entityType: 'ClaimStatus',
                entityId: h.claimId,
                action: `Status changed: ${h.fromStatus ?? 'Created'} → ${h.toStatus}`,
                newValue: h.toStatus,
                oldValue: h.fromStatus,
                remarks: h.remarks,
                performedBy: h.changedBy,
                performedByRole: (h.changedByRole ?? 'Trainer') as UserRole,
                performedAt: h.changedAt,
              }))}
            />
          </div>
        )}

        {/* Payment Record */}
        {activeTab === 'payment' && (
          <div className="space-y-6">
            {/* Payment summary card */}
            <div className="bg-white rounded-xl border border-emerald-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 bg-emerald-50 border-b border-emerald-100">
                <span className="text-2xl">💳</span>
                <div>
                  <h3 className="text-base font-bold text-emerald-800">Payment Processed</h3>
                  <p className="text-xs text-emerald-600">Bill {claim.billNo} — {claim.trainerName}</p>
                </div>
                <span className="ml-auto px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-bold">PAID</span>
              </div>
              {paymentRecord ? (
                <div className="p-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                    {[
                      { label: 'Paid Amount',    value: `${claim.currency === 'AED' ? 'AED' : '₹'} ${paymentRecord.paidAmount.toLocaleString('en-IN')}`, highlight: true },
                      { label: 'Payment Date',   value: new Date(paymentRecord.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
                      { label: 'Payment Mode',   value: paymentRecord.paymentMode },
                      { label: 'UTR / Reference',value: paymentRecord.utrReference, mono: true },
                      { label: 'Processed By',   value: paymentRecord.processedBy },
                      { label: 'Processed At',   value: new Date(paymentRecord.processedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) },
                    ].map(f => (
                      <div key={f.label} className={`rounded-lg px-4 py-3 ${f.highlight ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50 border border-gray-100'}`}>
                        <p className="text-[11px] text-gray-500 font-medium mb-0.5">{f.label}</p>
                        <p className={`font-bold text-sm ${f.highlight ? 'text-emerald-700 text-lg' : 'text-gray-800'} ${f.mono ? 'font-mono' : ''}`}>{f.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                  {paymentRecord.financeRemarks && (
                    <div className="mt-4 rounded-lg bg-amber-50 border border-amber-100 px-4 py-3">
                      <p className="text-xs font-semibold text-amber-700 mb-1">Finance Remarks</p>
                      <p className="text-sm text-gray-700">{paymentRecord.financeRemarks}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-6 py-8 text-center text-sm text-gray-400">
                  <p>Payment record not available on this device.</p>
                  <p className="text-xs mt-1 text-gray-300">Payment was processed from a different browser/device. Check the Payment Processing page for details.</p>
                </div>
              )}
            </div>

            {/* Full payment HISTORY — a bill paid more than once against the same claimId
                (e.g. an initial payment, then HR reopens/corrects the approved amount and a
                further payment covers the difference) must show every past entry, not just the
                most recent one. Only rendered when there's more than one, since the single-entry
                case is already fully shown in the card above. */}
            {paymentRecords.length > 1 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">🧾 Payment History ({paymentRecords.length} entries)</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Every payment recorded against this bill, most recent first</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {paymentRecords.map((p) => (
                    <div key={p.paymentId} className="px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-1">
                      <span className="font-bold text-emerald-700 text-base">
                        {claim.currency === 'AED' ? 'AED' : '₹'} {p.paidAmount.toLocaleString('en-IN')}
                      </span>
                      <span className="text-sm text-gray-600">{new Date(p.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{p.paymentMode}</span>
                      <span className="text-xs font-mono text-gray-500">{p.utrReference}</span>
                      <span className="text-xs text-gray-400">by {p.processedBy}</span>
                      {p.financeRemarks && <span className="text-xs text-amber-700 italic">— {p.financeRemarks}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* HR Actions taken on this claim */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">📋 HR Actions History</h3>
                <p className="text-xs text-gray-400 mt-0.5">All actions taken by HR Admin on this bill</p>
              </div>
              <div className="p-5">
                {claimHistory.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No status history available.</p>
                ) : (
                  <ol className="relative border-l-2 border-gray-200 ml-3 space-y-6">
                    {[...claimHistory].reverse().map((h, i) => {
                      const isPayment = h.toStatus === 'Paid';
                      const isApproved = h.toStatus === 'Approved' || h.toStatus === 'Partially Approved';
                      const isReject = h.toStatus === 'Rejected';
                      const color = isPayment ? 'bg-emerald-500' : isApproved ? 'bg-blue-500' : isReject ? 'bg-red-500' : 'bg-gray-400';
                      return (
                        <li key={i} className="ml-6">
                          <span className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full ${color} ring-2 ring-white`} />
                          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                isPayment ? 'bg-emerald-100 text-emerald-700' :
                                isApproved ? 'bg-blue-100 text-blue-700' :
                                isReject ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : h.toStatus}
                              </span>
                              <span className="text-[11px] text-gray-400">
                                {h.changedAt ? new Date(h.changedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                              </span>
                            </div>
                            {h.changedBy && (
                              <p className="mt-1.5 text-xs text-gray-600">
                                <span className="font-medium">By:</span> {h.changedBy} {h.changedByRole ? `(${h.changedByRole})` : ''}
                              </p>
                            )}
                            {h.remarks && (
                              <p className="mt-1 text-xs text-gray-500 italic">"{h.remarks}"</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>

            {/* Claim financial summary */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">💰 Financial Summary</h3>
              </div>
              <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Total Claimed',    value: claim.totalClaimedAmount ?? 0, color: 'text-gray-800' },
                  { label: 'Approved Amount',  value: claim.approvedAmount ?? 0,     color: 'text-blue-700' },
                  { label: 'Advance Adjusted', value: advanceAdjusted,    color: 'text-amber-600' },
                  { label: 'Recoverable Amount', value: claim.recoverableAmount ?? 0, color: (claim.recoverableAmount ?? 0) > 0 ? 'text-red-600' : 'text-gray-400' },
                  { label: 'Net Paid',         value: paymentRecord?.paidAmount ?? claim.netPayable ?? claim.totalClaimedAmount ?? 0, color: 'text-emerald-700' },
                ].map(f => (
                  <div key={f.label} className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 text-center">
                    <p className="text-[11px] text-gray-400 mb-1">{f.label}</p>
                    <p className={`font-bold text-base ${f.color}`}>
                      {claim.currency === 'AED' ? 'AED' : '₹'} {f.value.toLocaleString('en-IN')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky action bar ── */}
      {availableActions.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-lg px-6 py-3">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500 hidden sm:block">
              {claim.billNo} — actions available for your role ({currentUser.role})
            </p>
            <div className="flex flex-wrap gap-2 ml-auto">
              {availableActions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => handleActionClick(action)}
                  className={`
                    inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg
                    transition-colors focus:outline-none focus:ring-2
                    ${VARIANT_STYLES[action.variant]}
                  `}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Action modal ── */}
      {activeModal && (
        <ActionModal
          title={activeModal.modalTitle ?? activeModal.label}
          label={activeModal.modalLabel ?? 'Remarks'}
          confirmLabel={activeModal.modalConfirmLabel}
          confirmColor={
            activeModal.variant === 'danger'
              ? 'bg-red-600 hover:bg-red-700'
              : activeModal.variant === 'success'
              ? 'bg-green-600 hover:bg-green-700'
              : activeModal.variant === 'warning'
              ? 'bg-amber-500 hover:bg-amber-600'
              : 'bg-blue-600 hover:bg-blue-700'
          }
          onConfirm={(reason) => handleActionConfirm(activeModal, reason)}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* ── Toast ── */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-xl max-w-sm animate-fade-in">
          {toastMsg}
        </div>
      )}

      {/* ── Receipt Preview Modal ── */}
      {receiptPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setReceiptPreview(null)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50 rounded-t-2xl">
              <span className="text-sm font-semibold text-gray-800 truncate max-w-[80%]" title={receiptPreview.name}>
                📎 {receiptPreview.name}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={receiptPreview.url}
                  download={receiptPreview.name}
                  className="text-xs px-3 py-1 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
                  onClick={e => e.stopPropagation()}
                >
                  Download
                </a>
                <button
                  onClick={() => setReceiptPreview(null)}
                  className="text-gray-400 hover:text-gray-700 transition-colors p-1"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-gray-100 min-h-[300px]">
              {(() => {
                const url = receiptPreview.url;
                const name = receiptPreview.name.toLowerCase();
                const isPdf = url.startsWith('data:application/pdf') || name.endsWith('.pdf');
                const isImg = url.startsWith('data:image/') ||
                  /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name) ||
                  (!isPdf && !url.startsWith('data:'));
                if (isPdf) return (
                  <iframe src={url} title={receiptPreview.name} className="w-full rounded shadow" style={{ height: '70vh' }} />
                );
                if (isImg) return (
                  <img src={url} alt={receiptPreview.name} className="max-w-full max-h-[70vh] object-contain rounded shadow" />
                );
                return (
                  <img src={url} alt={receiptPreview.name} className="max-w-full max-h-[70vh] object-contain rounded shadow" />
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Route & Fare Estimate Modal ── */}
      {routeModal && (
        <RouteFareModal
          from={routeModal.from}
          to={routeModal.to}
          onClose={() => setRouteModal(null)}
        />
      )}
    </div>
  );
};

export default ClaimDetail;



