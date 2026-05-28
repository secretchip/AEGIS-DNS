import { LogoutButton } from "./LogoutButton";

const REASON_LABELS: Record<string, string> = {
  payment_failed: "Your most recent payment did not go through.",
  tos_violation: "A terms-of-use or policy violation was detected.",
  abuse: "Suspected abuse was detected on this account.",
  maintenance: "Your service is temporarily paused for maintenance.",
  other: "Your account has been suspended.",
};

export function SuspendedOverlay({
  reason,
  note,
}: {
  reason: string | null;
  note: string | null;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl">
          ⚠️
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Account suspended</h1>
        <p className="mt-2 text-sm text-slate-600">
          {REASON_LABELS[reason ?? "other"] ?? REASON_LABELS.other}
        </p>
        {note && (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {note}
          </p>
        )}
        <p className="mt-4 text-xs text-slate-500">
          DNS filtering for your endpoint is paused. Please contact your
          administrator. Your settings are preserved and will be restored on
          reactivation.
        </p>
        <div className="mt-6">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
