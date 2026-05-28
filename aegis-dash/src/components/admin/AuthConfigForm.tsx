"use client";

import { useState } from "react";
import { apiFetch, errorText } from "@/components/api-client";
import { Card } from "@/components/ui";

interface AuthConfig {
  method: "local" | "oidc" | "saml";
  enabled: boolean;
  allowLocalFallback: boolean;
  defaultClientRole: "owner" | "manager" | "viewer";
  roleClaim: string | null;
  roleMapping: Record<string, string> | null;
  config: Record<string, unknown> | null;
}

export function AuthConfigForm({
  clientId,
  initial,
}: {
  clientId: number;
  initial: AuthConfig | null;
}) {
  const [cfg, setCfg] = useState<AuthConfig>(
    initial ?? {
      method: "local",
      enabled: true,
      allowLocalFallback: true,
      defaultClientRole: "viewer",
      roleClaim: null,
      roleMapping: null,
      config: null,
    },
  );
  const [roleMappingText, setRoleMappingText] = useState(
    cfg.roleMapping ? JSON.stringify(cfg.roleMapping, null, 2) : "",
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const oidc = (cfg.config ?? {}) as Record<string, string>;

  function setOidc(key: string, value: string) {
    setCfg((c) => ({ ...c, config: { ...(c.config ?? {}), [key]: value } }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    let roleMapping: Record<string, string> | null = null;
    if (roleMappingText.trim()) {
      try {
        roleMapping = JSON.parse(roleMappingText);
      } catch {
        setError("Role mapping must be valid JSON.");
        setBusy(false);
        return;
      }
    }
    try {
      await apiFetch(`/api/admin/clients/${clientId}/auth`, {
        method: "PUT",
        json: { ...cfg, roleMapping },
      });
      setSaved(true);
    } catch (err) {
      setError(errorText((err as { code?: string }).code ?? "error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Authentication"
      description="Configure how this client's users sign in. SSO settings take effect immediately — no code change needed."
    >
      <form onSubmit={save} className="space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-600">Saved.</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-slate-600">Method</span>
            <select
              value={cfg.method}
              onChange={(e) => setCfg((c) => ({ ...c, method: e.target.value as AuthConfig["method"] }))}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
            >
              <option value="local">Local password</option>
              <option value="oidc">OIDC (SSO)</option>
              <option value="saml">SAML (SSO)</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Default role for new SSO users</span>
            <select
              value={cfg.defaultClientRole}
              onChange={(e) =>
                setCfg((c) => ({ ...c, defaultClientRole: e.target.value as AuthConfig["defaultClientRole"] }))
              }
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-sm capitalize"
            >
              <option value="owner">Owner</option>
              <option value="manager">Manager</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={cfg.allowLocalFallback}
            onChange={(e) => setCfg((c) => ({ ...c, allowLocalFallback: e.target.checked }))}
            className="h-4 w-4 accent-brand"
          />
          Allow local password fallback (break-glass)
        </label>

        {cfg.method === "oidc" && (
          <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-slate-600">Issuer URL</span>
                <input
                  value={oidc.issuer ?? ""}
                  onChange={(e) => setOidc("issuer", e.target.value)}
                  placeholder="https://idp.example.com"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Client ID</span>
                <input
                  value={oidc.clientId ?? ""}
                  onChange={(e) => setOidc("clientId", e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Client secret</span>
                <input
                  type="password"
                  value={oidc.clientSecret ?? ""}
                  onChange={(e) => setOidc("clientSecret", e.target.value)}
                  placeholder="leave blank to keep existing"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Scopes</span>
                <input
                  value={oidc.scopes ?? ""}
                  onChange={(e) => setOidc("scopes", e.target.value)}
                  placeholder="openid email profile"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-slate-600">Role claim (optional)</span>
                <input
                  value={cfg.roleClaim ?? ""}
                  onChange={(e) => setCfg((c) => ({ ...c, roleClaim: e.target.value || null }))}
                  placeholder="groups"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Role mapping (JSON)</span>
                <textarea
                  value={roleMappingText}
                  onChange={(e) => setRoleMappingText(e.target.value)}
                  rows={3}
                  placeholder={'{ "dns-admins": "owner" }'}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
                />
              </label>
            </div>
          </div>
        )}

        {cfg.method === "saml" && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
            SAML is supported in the data model and routing; the provider ships as
            a structured stub in this build.
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save authentication"}
        </button>
      </form>
    </Card>
  );
}
