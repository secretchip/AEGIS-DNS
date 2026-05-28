"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, errorText } from "@/components/api-client";
import { Badge, Card } from "@/components/ui";

const REASONS = [
  { value: "payment_failed", label: "Payment failed" },
  { value: "tos_violation", label: "Terms / policy violation" },
  { value: "abuse", label: "Abuse detected" },
  { value: "maintenance", label: "Maintenance" },
  { value: "other", label: "Other" },
] as const;

export function DisableControl({
  clientId,
  status,
  reason,
  note,
}: {
  clientId: number;
  status: "active" | "disabled";
  reason: string | null;
  note: string | null;
}) {
  const router = useRouter();
  const [selReason, setSelReason] = useState<string>("payment_failed");
  const [selNote, setSelNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/clients/${clientId}/disable`, {
        method: "POST",
        json: { reason: selReason, note: selNote || undefined },
      });
      router.refresh();
    } catch (err) {
      setError(errorText((err as { code?: string }).code ?? "error"));
    } finally {
      setBusy(false);
    }
  }

  async function reactivate() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/clients/${clientId}/reactivate`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError(errorText((err as { code?: string }).code ?? "error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Service status"
      description="Disabling removes the client's slug from the Technitium config (settings are retained and restored on reactivation)."
      actions={<Badge tone={status === "active" ? "green" : "red"}>{status}</Badge>}
    >
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {status === "active" ? (
        <form onSubmit={disable} className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="text-slate-600">Reason</span>
            <select
              value={selReason}
              onChange={(e) => setSelReason(e.target.value)}
              className="mt-1 block rounded-md border border-slate-300 px-2 py-2 text-sm"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-sm">
            <span className="text-slate-600">Note (optional)</span>
            <input
              value={selNote}
              onChange={(e) => setSelNote(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            Disable client
          </button>
        </form>
      ) : (
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Suspended — reason: <span className="font-medium">{reason ?? "—"}</span>
            {note && <span className="text-slate-400"> · {note}</span>}
          </div>
          <button
            onClick={reactivate}
            disabled={busy}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            Reactivate
          </button>
        </div>
      )}
    </Card>
  );
}
