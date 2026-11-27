import React, { useState, useEffect, useRef } from 'react';
import { UserCheck, ShieldCheck, Banknote, Crown, Loader2, AlertCircle, ArrowLeft, Eye, EyeOff, Lock, Mail, RefreshCw } from 'lucide-react';
import type { User, UserRole, PmsEmployeeDetails } from '../types';
import { mockUsers } from '../data/mockUsers';
import SubmissionsClosedBanner from '../components/SubmissionsClosedBanner';

// ── PMS API — via server-side endpoint (credentials never in browser) ──────────

type PmsEmployee = PmsEmployeeDetails;

async function fetchEmployeeFromPMS(empCode: string): Promise<PmsEmployee | null> {
  const code = empCode.replace(/^EMP-/i, '').trim();
  const res = await fetch(`/api/employee?empCode=${encodeURIComponent(code)}`);
  const d = await res.json();
  if (!res.ok || d.error) throw new Error(d.error || 'Employee fetch failed');
  return d.employee ?? null;
}

function getInitials(first: string | null, last: string | null): string {
  const f = (first ?? '').trim()[0] ?? '';
  const l = (last ?? '').trim()[0] ?? '';
  return (f + l).toUpperCase() || 'TR';
}

// ── Non-trainer role cards ─────────────────────────────────────────────────────

interface RoleCard {
  role: UserRole;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  border: string;
  iconBg: string;
}

// Passwords for protected roles — keep confidential
const ROLE_PASSWORDS: Record<string, string> = {
  HRAdmin:    'KHR@2026!',
  Finance:    'KFin#2026$',
  SuperAdmin: 'KSuper@2026#',
};

const otherRoleCards: RoleCard[] = [
  {
    role: 'HRAdmin',
    label: 'HR / Admin',
    description: 'Review and process trainer claims, manage assignments and policies.',
    icon: <ShieldCheck size={28} />,
    color: 'text-emerald-600',
    border: 'border-emerald-200 hover:border-emerald-400',
    iconBg: 'bg-emerald-50',
  },
  {
    role: 'Finance',
    label: 'Finance',
    description: 'Approve payments, run reports, manage ledger reconciliation.',
    icon: <Banknote size={28} />,
    color: 'text-amber-600',
    border: 'border-amber-200 hover:border-amber-400',
    iconBg: 'bg-amber-50',
  },
  {
    role: 'SuperAdmin',
    label: 'Super Admin',
    description: 'Full system access — users, policies, audit logs, configuration.',
    icon: <Crown size={28} />,
    color: 'text-purple-600',
    border: 'border-purple-200 hover:border-purple-400',
    iconBg: 'bg-purple-50',
  },
];

// ── Password-protected role card ──────────────────────────────────────────────

interface ProtectedRoleCardProps {
  card: RoleCard;
  onLogin: (user: User) => void;
}

function ProtectedRoleCard({ card, onLogin }: ProtectedRoleCardProps) {
  const { role, label, description, icon, color, border, iconBg } = card;
  const [expanded, setExpanded]     = useState(false);
  const [password, setPassword]     = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [error, setError]           = useState('');
  const [attempts, setAttempts]     = useState(0);
  const MAX_ATTEMPTS = 5;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (attempts >= MAX_ATTEMPTS) return;
    if (password === ROLE_PASSWORDS[role]) {
      const user = mockUsers.find(u => u.role === role);
      if (user) onLogin(user as unknown as User);
    } else {
      const left = MAX_ATTEMPTS - attempts - 1;
      setAttempts(a => a + 1);
      setError(left > 0 ? `Incorrect password. ${left} attempt${left !== 1 ? 's' : ''} remaining.` : 'Too many incorrect attempts. Please contact the administrator.');
      setPassword('');
    }
  }

  if (!expanded) {
    return (
      <div
        className={`border-2 ${border} rounded-xl p-5 flex flex-col gap-3 transition-all duration-200 cursor-pointer hover:shadow-md bg-white`}
        onClick={() => setExpanded(true)}
      >
        <div className="flex items-center gap-3">
          <div className={`${iconBg} ${color} rounded-lg p-2.5`}>{icon}</div>
          <div>
            <p className="font-semibold text-gray-800">{label}</p>
            <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
              <Lock size={10} /> Password protected
            </p>
          </div>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
        <button
          className={`mt-auto w-full py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${color} border border-current hover:bg-opacity-10`}
          style={{ background: 'transparent' }}
          onClick={e => { e.stopPropagation(); setExpanded(true); }}
        >
          Login as {label}
        </button>
      </div>
    );
  }

  return (
    <div className={`border-2 ${border.replace('hover:border-\\S+', '')} rounded-xl p-5 flex flex-col gap-4 bg-white shadow-md`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`${iconBg} ${color} rounded-lg p-2.5`}>{icon}</div>
          <div>
            <p className="font-semibold text-gray-800">{label} Login</p>
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Lock size={10} /> Enter your access password
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setExpanded(false); setError(''); setPassword(''); setAttempts(0); }}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft size={13} /> Back
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="Enter access password"
              autoFocus
              disabled={attempts >= MAX_ATTEMPTS}
              className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPass(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!password || attempts >= MAX_ATTEMPTS}
          className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 text-white disabled:opacity-50 disabled:cursor-not-allowed ${
            role === 'HRAdmin'    ? 'bg-emerald-600 hover:bg-emerald-700' :
            role === 'Finance'   ? 'bg-amber-500 hover:bg-amber-600' :
                                   'bg-purple-600 hover:bg-purple-700'
          }`}
        >
          <Lock size={14} /> Login as {label}
        </button>
      </form>
    </div>
  );
}

// ── Trainer login card ─────────────────────────────────────────────────────────

interface TrainerCardProps {
  onLogin: (user: User) => void;
  autoExpand?: boolean;
  initialEmpCode?: string | null;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`;
}

const OTP_RESEND_COOLDOWN = 30; // seconds

function TrainerLoginCard({ onLogin, autoExpand, initialEmpCode }: TrainerCardProps) {
  const [expanded, setExpanded]   = useState(false);
  const [empCode, setEmpCode]     = useState('');
  const [showCode, setShowCode]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // Pre-fetch employee while trainer is typing — so PMS lookup is done by the time they click Send OTP
  const prefetchCache = useRef<{ code: string; promise: Promise<{ emp: PmsEmployee | null; failed: boolean }> } | null>(null);

  function getPrefetchedEmployee(code: string): Promise<{ emp: PmsEmployee | null; failed: boolean }> {
    if (prefetchCache.current?.code === code) return prefetchCache.current.promise;
    // A transient PMS/network failure here must NOT be collapsed into "employee not found" — that
    // message tells a real trainer their employee code is wrong, when the actual cause was a
    // timeout on Koenig's side. Distinguish the two so submitCode can show the correct message
    // and let the trainer retry, instead of them thinking they mistyped their code.
    const promise = fetchEmployeeFromPMS(code)
      .then(emp => ({ emp, failed: false }))
      .catch(() => ({ emp: null, failed: true }));
    prefetchCache.current = { code, promise };
    return promise;
  }

  // Prefetch employee as trainer types — eliminates PMS lookup delay on submit
  useEffect(() => {
    const code = empCode.trim();
    if (code.length < 3) return;
    const t = setTimeout(() => { getPrefetchedEmployee(code); }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empCode]);

  // OTP step state
  const [step, setStep]           = useState<'code' | 'otp'>('code');
  const [otpValue, setOtpValue]   = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError]   = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [cooldown, setCooldown]   = useState(0);
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [screenOtp, setScreenOtp] = useState('');
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  function startCooldown() {
    setCooldown(OTP_RESEND_COOLDOWN);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown(c => {
        if (c <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  async function sendOtp(user: User, email: string): Promise<boolean> {
    try {
      // Single call: server saves OTP to Turso AND sends email in parallel.
      // Returns only when email is confirmed delivered to Resend — guaranteed in inbox.
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'send-otp', email, trainerName: user.name }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        setError(d.error || 'Failed to send OTP. Please try again.');
        return false;
      }
      if (d.otp) setScreenOtp(String(d.otp));
      return true;
    } catch {
      setError('Unable to send OTP. Please check your connection and try again.');
      return false;
    }
  }

  async function submitCode(codeArg?: string) {
    const code = (codeArg ?? empCode).trim();
    if (!code) { setError('Please enter your employee code.'); return; }

    setLoading(true);
    setError('');

    // Use pre-fetched result if available (started as trainer typed) — avoids 2-5s PMS lookup
    const { emp, failed } = await getPrefetchedEmployee(code);

    if (failed) {
      setError('Unable to reach Koenig PMS. Please check your connection and try again.');
      setLoading(false);
      return;
    }

    if (!emp || (!emp.first_name && !emp.email_address)) {
      setError('Employee not found. Please check your employee code and try again.');
      setLoading(false);
      return;
    }

    const firstName  = emp.first_name ?? emp.FirstName ?? emp.first_Name ?? '';
    const middleName = emp.middle_name ?? emp.MiddleName ?? '';
    const lastName   = emp.last_name ?? emp.LastName ?? emp.last_Name ?? '';
    const fullName   = [firstName, middleName, lastName].filter(Boolean).join(' ') || `Trainer ${code}`;

    // PMS returns email under different field names depending on the API version
    const email = String(
      emp.email_address ||
      emp.Email ||
      emp.email ||
      emp.EmailAddress ||
      emp.emailAddress ||
      emp.EmailId ||
      emp.email_id ||
      emp.personal_email ||
      emp.PersonalEmail ||
      emp.OfficialEmail ||
      emp.official_email ||
      emp.WorkEmail ||
      emp.work_email ||
      ''
    ).trim();

    const user: User = {
      id: `emp-${code}`,
      name: fullName,
      email: email || `emp${code}@koenig-solutions.com`,
      role: 'Trainer',
      avatarInitials: getInitials(emp.first_name, emp.last_name),
      trainerId: code,
      pmsDetails: emp,
    };

    if (!email) {
      setError('No email address found in your profile. Please contact HR to update your email before logging in.');
      setLoading(false);
      return;
    }

    // Send OTP
    const sent = await sendOtp(user, email);
    if (!sent) { setLoading(false); return; }

    setPendingUser(user);
    setMaskedEmail(maskEmail(email));
    setOtpValue('');
    setOtpError('');
    setStep('otp');
    startCooldown();
    setLoading(false);
  }

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitCode();
  }

  // Auto-expand and auto-submit when arriving pre-filled from the RMS link (still
  // requires the trainer to receive and enter the OTP — never skips verification).
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!autoExpand || !initialEmpCode) return;
    autoStartedRef.current = true;
    setExpanded(true);
    setEmpCode(initialEmpCode);
    submitCode(initialEmpCode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExpand, initialEmpCode]);

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    const entered = otpValue.trim();
    if (entered.length !== 6 || !/^\d{6}$/.test(entered)) {
      setOtpError('Please enter the 6-digit OTP sent to your email.');
      return;
    }

    setOtpLoading(true);
    setOtpError('');

    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'verify-otp', email: pendingUser!.email, otp: entered }),
      });
      const d = await res.json();
      if (d.valid) {
        onLogin(pendingUser!);
      } else {
        setOtpError(d.error || 'Incorrect OTP. Please check and try again.');
      }
    } catch {
      setOtpError('Verification failed. Please check your connection and try again.');
    }

    setOtpLoading(false);
  }

  async function handleResend() {
    if (cooldown > 0 || !pendingUser) return;
    setOtpError('');
    setOtpValue('');
    const sent = await sendOtp(pendingUser, pendingUser.email);
    if (sent) startCooldown();
  }

  function handleBack() {
    setExpanded(false);
    setStep('code');
    setEmpCode('');
    setError('');
    setOtpValue('');
    setOtpError('');
    setPendingUser(null);
    setScreenOtp('');
    setCooldown(0);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
  }

  if (!expanded) {
    return (
      <div
        className="border-2 border-blue-200 hover:border-blue-400 rounded-xl p-5 flex flex-col gap-3 transition-all duration-200 cursor-pointer hover:shadow-md bg-white"
        onClick={() => setExpanded(true)}
      >
        <div className="flex items-center gap-3">
          <div className="bg-blue-50 text-blue-600 rounded-lg p-2.5"><UserCheck size={28} /></div>
          <div>
            <p className="font-semibold text-gray-800">Trainer</p>
          </div>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">
          Submit TA/DA claims, track reimbursements, view assignment history.
        </p>
        <button
          className="mt-auto w-full py-2 rounded-lg text-sm font-medium transition-colors duration-150 text-blue-600 border border-blue-600 hover:bg-blue-50"
          onClick={e => { e.stopPropagation(); setExpanded(true); }}
        >
          Login as Trainer
        </button>
      </div>
    );
  }

  return (
    <div className="border-2 border-blue-400 rounded-xl p-5 flex flex-col gap-4 bg-white shadow-md col-span-1 sm:col-span-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-50 text-blue-600 rounded-lg p-2.5">
            {step === 'otp' ? <Mail size={24} /> : <UserCheck size={24} />}
          </div>
          <div>
            <p className="font-semibold text-gray-800">
              {step === 'otp' ? 'Verify Your Identity' : 'Trainer Login'}
            </p>
            <p className="text-xs text-gray-400">
              {step === 'otp'
                ? `OTP sent to ${maskedEmail}`
                : 'Enter your Koenig employee code to continue'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={step === 'otp' ? () => { setStep('code'); setOtpValue(''); setOtpError(''); } : handleBack}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft size={13} /> {step === 'otp' ? 'Change code' : 'Back'}
        </button>
      </div>

      {/* Step 1 — Employee Code */}
      {step === 'code' && (
        <form onSubmit={handleCodeSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Employee Code</label>
            <div className="relative">
              <input
                type={showCode ? 'text' : 'password'}
                value={empCode}
                onChange={e => { setEmpCode(e.target.value); setError(''); }}
                placeholder="e.g. 1234"
                autoFocus
                className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white"
              />
              <button
                type="button"
                onClick={() => setShowCode(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showCode ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !empCode.trim()}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 size={15} className="animate-spin" /> Verifying &amp; Sending OTP…</>
            ) : (
              'Send OTP →'
            )}
          </button>

          <p className="text-center text-xs text-gray-400">
            An OTP will be sent to your registered email from Koenig PMS.
          </p>
        </form>
      )}

      {/* Step 2 — OTP */}
      {step === 'otp' && (
        <form onSubmit={handleOtpSubmit} className="space-y-3">
          {/* Info banner */}
          <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
            <Mail size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              A 6-digit OTP has been sent to <strong>{maskedEmail}</strong>. Enter it below to login. Valid for 10 minutes.
            </span>
          </div>

          {/* Show OTP on screen so trainer can login instantly without waiting for email */}
          {screenOtp && (
            <div className="px-3 py-3 bg-green-50 border border-green-200 rounded-lg text-center">
              <p className="text-xs text-green-700 font-medium mb-1">Your OTP (also sent to your email):</p>
              <p className="text-3xl font-bold tracking-[0.3em] text-green-800 font-mono">{screenOtp}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Enter OTP</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={otpValue}
              onChange={e => { setOtpValue(e.target.value.replace(/\D/g, '')); setOtpError(''); }}
              placeholder="6-digit OTP"
              autoFocus
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white text-center tracking-[0.4em] font-mono text-lg"
            />
          </div>

          {otpError && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              {otpError}
            </div>
          )}

          <button
            type="submit"
            disabled={otpLoading || otpValue.length !== 6}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {otpLoading ? (
              <><Loader2 size={15} className="animate-spin" /> Verifying…</>
            ) : (
              'Login →'
            )}
          </button>

          {/* Resend */}
          <div className="text-center">
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
            >
              <RefreshCw size={11} />
              {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Main login page ────────────────────────────────────────────────────────────

interface Props {
  onLogin: (user: User) => void;
  // Set when arriving from the RMS-integrated link (?email=&id=) for a non-HR-Admin
  // email — skips the role grid and lands straight on the Trainer card. OTP is still
  // required; this only removes the extra "which role am I" click.
  showTrainerCardDirectly?: boolean;
  initialEmpCode?: string | null;
}

const LoginRoleSelector: React.FC<Props> = ({ onLogin, showTrainerCardDirectly, initialEmpCode }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12" style={{ backgroundColor: '#eef4fa' }}>
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <img
          src="/koenig-logo.svg"
          alt="Koenig Solutions"
          className="h-16 w-auto mb-2"
          draggable={false}
        />
        <p className="text-sm text-gray-500">Enterprise Training &amp; Learning</p>
      </div>

      <SubmissionsClosedBanner className="w-full max-w-3xl mb-4" />

      {/* Card */}
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="px-8 py-6 text-center" style={{ background: 'linear-gradient(135deg, #1a56db 0%, #1e429f 100%)' }}>
          <h2 className="text-xl font-semibold text-white">TA / DA Portal</h2>
          <p className="text-blue-200 text-sm mt-1">Travel Allowance &amp; Daily Allowance Management</p>
        </div>

        <div className="p-8">
          {showTrainerCardDirectly ? (
            <div className="max-w-md mx-auto">
              <TrainerLoginCard onLogin={onLogin} autoExpand initialEmpCode={initialEmpCode} />
            </div>
          ) : (
            <>
              <p className="text-center text-gray-500 text-sm mb-6">Select your role to continue</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Trainer card — API login */}
                <TrainerLoginCard onLogin={onLogin} />

                {/* Other roles — password protected */}
                {otherRoleCards.map(card => (
                  <ProtectedRoleCard key={card.role} card={card} onLogin={onLogin} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-400 text-center">
        Trainer login is verified via Koenig PMS. HR/Admin, Finance &amp; Super Admin require an access password.
      </p>
    </div>
  );
};

export default LoginRoleSelector;
