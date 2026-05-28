"use client";

import { useState } from "react";
import { apiFetch, errorText } from "@/components/api-client";
import { Card } from "@/components/ui";

interface Endpoint {
  doh: string;
  dot: string;
  doq: string;
}

function Row({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="w-12 text-xs font-semibold uppercase text-slate-500">{label}</span>
      <code className="flex-1 truncate text-sm text-slate-800">{value}</code>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function EndpointPanel({
  endpoint,
  provisioned,
  canProvision,
  disabled,
}: {
  endpoint: Endpoint;
  provisioned: boolean;
  canProvision: boolean;
  disabled: boolean;
}) {
  const [isProvisioned, setProvisioned] = useState(provisioned);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function provision() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/client/endpoint", { method: "POST" });
      setProvisioned(true);
    } catch (err) {
      setError(errorText((err as { code?: string }).code ?? "error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Resolver endpoint"
      description="Point your devices' encrypted DNS at these per-organisation URLs."
      actions={
        !isProvisioned && canProvision && !disabled ? (
          <button
            onClick={provision}
            disabled={busy}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? "Provisioning…" : "Provision endpoint"}
          </button>
        ) : null
      }
    >
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {!isProvisioned && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Endpoint not provisioned yet. The URLs below become active once
          provisioned.
        </p>
      )}
      <div className="space-y-2">
        <Row label="DoH" value={endpoint.doh} />
        <Row label="DoT" value={endpoint.dot} />
        <Row label="DoQ" value={endpoint.doq} />
      </div>
    </Card>
  );
}
