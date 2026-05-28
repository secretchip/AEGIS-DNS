import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clientAuthConfigs, clientPolicies, clients, users } from "@/db/schema";
import { CreateAccountForm } from "@/components/admin/CreateAccountForm";
import { Badge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminAccountsPage() {
  const rows = db.select().from(clients).all();
  const accounts = rows.map((c) => {
    const cfg = db
      .select()
      .from(clientAuthConfigs)
      .where(eq(clientAuthConfigs.clientId, c.id))
      .get();
    const clientUsers = db.select().from(users).where(eq(users.clientId, c.id)).all();
    const owner = clientUsers.find((u) => u.clientRole === "owner");
    const enabledPolicies = db
      .select()
      .from(clientPolicies)
      .where(eq(clientPolicies.clientId, c.id))
      .all()
      .filter((p) => p.enabled).length;
    return {
      ...c,
      authMethod: cfg?.method ?? "local",
      ownerEmail: owner?.email ?? "—",
      userCount: clientUsers.length,
      enabledPolicies,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Client accounts</h1>
          <p className="text-sm text-slate-500">{accounts.length} total</p>
        </div>
        <CreateAccountForm />
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2">Client</th>
              <th>Owner</th>
              <th>Auth</th>
              <th>Status</th>
              <th>Endpoint</th>
              <th>Users</th>
              <th>Policies</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {accounts.map((a) => (
              <tr key={a.id}>
                <td className="py-3">
                  <div className="font-medium text-slate-800">{a.name}</div>
                  <div className="text-xs text-slate-400">{a.slug}.{a.endpointBase}</div>
                </td>
                <td className="text-slate-600">{a.ownerEmail}</td>
                <td className="uppercase text-xs text-slate-500">{a.authMethod}</td>
                <td>
                  <Badge tone={a.status === "active" ? "green" : "red"}>{a.status}</Badge>
                </td>
                <td>
                  {a.provisionedAt ? (
                    <Badge tone="blue">provisioned</Badge>
                  ) : (
                    <Badge tone="slate">pending</Badge>
                  )}
                </td>
                <td className="text-slate-600">{a.userCount}</td>
                <td className="text-slate-600">{a.enabledPolicies}</td>
                <td className="text-right">
                  <Link
                    href={`/admin/clients/${a.id}`}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
