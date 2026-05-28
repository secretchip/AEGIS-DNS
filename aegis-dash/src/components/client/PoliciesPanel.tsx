"use client";

import { useState } from "react";
import { apiFetch, errorText } from "@/components/api-client";
import { Card } from "@/components/ui";

interface Policy {
  key: string;
  label: string;
  description: string;
  group: "base" | "category";
  enabled: boolean;
}

export function PoliciesPanel({
  initial,
  canManage,
  disabled,
}: {
  initial: Policy[];
  canManage: boolean;
  disabled: boolean;
}) {
  const [policies, setPolicies] = useState(initial);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: string, enabled: boolean) {
    if (!canManage || disabled) return;
    setSavingKey(key);
    setError(null);
    const prev = policies;
    setPolicies((p) => p.map((x) => (x.key === key ? { ...x, enabled } : x)));
    try {
      await apiFetch("/api/client/policies", {
        method: "POST",
        json: { policies: [{ key, enabled }] },
      });
    } catch (err) {
      setPolicies(prev);
      setError(errorText((err as { code?: string }).code ?? "error"));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <Card
      title="Policies & blocklists"
      description="Choose which AEGIS-DNS lists are enforced on your endpoint."
    >
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="space-y-2">
        {policies.map((p) => (
          <label
            key={p.key}
            className="flex cursor-pointer items-center justify-between rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50"
          >
            <div>
              <div className="text-sm font-medium text-slate-800">{p.label}</div>
              <div className="text-xs text-slate-500">{p.description}</div>
            </div>
            <input
              type="checkbox"
              checked={p.enabled}
              disabled={!canManage || disabled || savingKey === p.key}
              onChange={(e) => toggle(p.key, e.target.checked)}
              className="h-4 w-4 accent-brand disabled:opacity-50"
            />
          </label>
        ))}
      </div>
      {!canManage && (
        <p className="mt-3 text-xs text-slate-400">
          Read-only — your role cannot change policies.
        </p>
      )}
    </Card>
  );
}
