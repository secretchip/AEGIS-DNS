"use client";

import { useState } from "react";
import { apiFetch, errorText } from "./api-client";
import { Badge, Card } from "./ui";

export interface ManagedUser {
  id: number;
  email: string;
  clientRole: "owner" | "manager" | "viewer";
  status: "active" | "blocked";
  authSource: "local" | "oidc" | "saml";
}

const ROLES = ["owner", "manager", "viewer"] as const;

/**
 * Reusable user-management table. `apiBase` is the collection endpoint
 * (e.g. "/api/client/users" or "/api/admin/clients/3/users"); item operations
 * target `${apiBase}/${id}`.
 */
export function UsersManager({
  apiBase,
  initial,
  currentUserId,
  disabled = false,
  title = "Team",
  description = "Manage who can access this organisation's dashboard.",
}: {
  apiBase: string;
  initial: ManagedUser[];
  currentUserId: number | null;
  disabled?: boolean;
  title?: string;
  description?: string;
}) {
  const [users, setUsers] = useState(initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<ManagedUser["clientRole"]>("viewer");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function err(e: unknown) {
    setError(errorText((e as { code?: string }).code ?? "error"));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await apiFetch<{ user: ManagedUser }>(apiBase, {
        method: "POST",
        json: {
          email,
          password: password || undefined,
          clientRole: role,
          authSource: password ? "local" : "oidc",
        },
      });
      setUsers((u) => [...u, user]);
      setEmail("");
      setPassword("");
    } catch (e) {
      err(e);
    } finally {
      setBusy(false);
    }
  }

  async function update(id: number, patch: Partial<Pick<ManagedUser, "clientRole" | "status">>) {
    setError(null);
    const prev = users;
    setUsers((u) => u.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      await apiFetch(`${apiBase}/${id}`, { method: "PATCH", json: patch });
    } catch (e) {
      setUsers(prev);
      err(e);
    }
  }

  async function remove(id: number) {
    setError(null);
    const prev = users;
    setUsers((u) => u.filter((x) => x.id !== id));
    try {
      await apiFetch(`${apiBase}/${id}`, { method: "DELETE" });
    } catch (e) {
      setUsers(prev);
      err(e);
    }
  }

  return (
    <Card title={title} description={description}>
      {!disabled && (
        <form onSubmit={create} className="mb-4 flex flex-wrap items-end gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@org.com"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password (blank = SSO)"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as ManagedUser["clientRole"])}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm capitalize"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            Add user
          </button>
        </form>
      )}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="py-2">Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Auth</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {users.map((u) => {
            const isSelf = u.id === currentUserId;
            return (
              <tr key={u.id}>
                <td className="py-2 font-medium text-slate-800">
                  {u.email}
                  {isSelf && <span className="ml-1 text-xs text-slate-400">(you)</span>}
                </td>
                <td>
                  <select
                    value={u.clientRole}
                    disabled={disabled}
                    onChange={(e) =>
                      update(u.id, { clientRole: e.target.value as ManagedUser["clientRole"] })
                    }
                    className="rounded border border-slate-200 px-1.5 py-1 text-xs capitalize disabled:opacity-50"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <Badge tone={u.status === "active" ? "green" : "red"}>{u.status}</Badge>
                </td>
                <td className="text-xs uppercase text-slate-500">{u.authSource}</td>
                <td className="space-x-2 py-2 text-right">
                  {!isSelf && !disabled && (
                    <>
                      <button
                        onClick={() =>
                          update(u.id, { status: u.status === "active" ? "blocked" : "active" })
                        }
                        className="text-xs text-slate-500 hover:text-amber-600"
                      >
                        {u.status === "active" ? "Block" : "Unblock"}
                      </button>
                      <button
                        onClick={() => remove(u.id)}
                        className="text-xs text-slate-500 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
