import { SUBMISSIONS_CLOSED } from '../config';

// Shown on the login page and at the top of the claim form while new submissions are frozen.
export default function SubmissionsClosedBanner({ className = '' }: { className?: string }) {
  if (!SUBMISSIONS_CLOSED) return null;
  return (
    <div role="alert" className={`flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 ${className}`}>
      <span className="text-lg leading-none" aria-hidden="true">⚠️</span>
      <div>
        <p className="text-sm font-semibold text-red-800">New claim submissions are closed</p>
        <p className="text-xs text-red-700 mt-0.5">
          New TA/DA claims can no longer be submitted from this dashboard. Kindly use the new TADA dashboard from RMS to submit your claims.
        </p>
      </div>
    </div>
  );
}
