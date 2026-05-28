"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, errorText } from "@/components/api-client";

interface MethodInfo {
  method: "local" | "oidc" | "saml";
  localAllowed: boolean;
  clientSlug: string | null;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [info, setInfo] = useState<MethodInfo | null>(null);
  const [error, setError] = useState<string | null>(
    params.get("error") ? errorText(params.get("error")!) : null,
  );
  const [busy, setBusy] = useState(false);

  async function resolveMethod() {
    if (!email.includes("@")) return;
    try {
      const data = await apiFetch<MethodInfo>(
        `/api/auth/login?email=${encodeURIComponent(email)}`,
      );
      setInfo(data);
    } catch {
      setInfo(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<{ redirect: string }>("/api/auth/login", {
        method: "POST",
        json: { email, password },
      });
      router.push(params.get("next") || data.redirect);
      router.refresh();
    } catch (err) {
      const code = (err as { code?: string }).code ?? "error";
      setError(errorText(code));
    } finally {
      setBusy(false);
    }
  }

  const ssoOnly = info && !info.localAllowed && info.method !== "local";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">AEGIS-DNS</h1>
          <p className="text-sm text-slate-500">Sign in to your dashboard</p>
        </div>
        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={resolveMethod}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              placeholder="you@example.com"
            />
          </div>

          {ssoOnly ? (
            <a
              href={`/api/auth/sso/${info!.clientSlug}/start`}
              className="block w-full rounded-md bg-brand px-3 py-2 text-center text-sm font-medium text-white hover:bg-brand-dark"
            >
              Sign in with SSO
            </a>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {busy ? "Signing in…" : "Sign in"}
              </button>
              {info && info.method !== "local" && info.localAllowed && (
                <a
                  href={`/api/auth/sso/${info.clientSlug}/start`}
                  className="block text-center text-sm text-brand hover:underline"
                >
                  Or sign in with SSO
                </a>
              )}
            </>
          )}
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
