"use client";

import { useState } from "react";
import { apiFetch, errorText } from "@/components/api-client";
import { Badge, Card } from "@/components/ui";

interface Rule {
  id: number;
  kind: "allow" | "deny";
  domain: string;
}

export function RulesPanel({
  initial,
  canManage,
  disabled,
}: {
  initial: Rule[];
  canManage: boolean;
  disabled: boolean;
}) {
  const [rules, setRules] = useState(initial);
  const [domain, setDomain] = useState("");
  const [kind, setKind] = useState<"allow" | "deny">("allow");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readOnly = !canManage || disabled;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { rule } = await apiFetch<{ rule: Rule }>("/api/client/rules", {
        method: "POST",
        json: { kind, domain },
      });
      setRules((r) => [...r, rule]);
      setDomain("");
    } catch (err) {
      setError(errorText((err as { code?: string }).code ?? "error"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    const prev = rules;
    setRules((r) => r.filter((x) => x.id !== id));
    try {
      await apiFetch(`/api/client/rules?id=${id}`, { method: "DELETE" });
    } catch {
      setRules(prev);
    }
  }

  return (
    <Card
      title="Allow / deny rules"
      description="Override list decisions for your own endpoint."
    >
      {!readOnly && (
        <form onSubmit={add} className="mb-4 flex flex-wrap items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "allow" | "deny")}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </select>
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com or *.example.com"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            Add
          </button>
        </form>
      )}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {rules.length === 0 ? (
        <p className="text-sm text-slate-400">No custom rules yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2 text-sm text-slate-800">
                <Badge tone={r.kind === "allow" ? "green" : "red"}>{r.kind}</Badge>
                {r.domain}
              </span>
              {!readOnly && (
                <button
                  onClick={() => remove(r.id)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
