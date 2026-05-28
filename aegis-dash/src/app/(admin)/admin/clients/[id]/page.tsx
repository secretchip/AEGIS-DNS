import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clientAuthConfigs, clients, users } from "@/db/schema";
import { AuthConfigForm } from "@/components/admin/AuthConfigForm";
import { DisableControl } from "@/components/admin/DisableControl";
import { UsersManager } from "@/components/UsersManager";
import { Card } from "@/components/ui";
import { getTechnitium } from "@/lib/technitium";

export const dynamic = "force-dynamic";

export default async function AdminClientDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  const client = db.select().from(clients).where(eq(clients.id, id)).get();
  if (!client) notFound();

  const authRow = db
    .select()
    .from(clientAuthConfigs)
    .where(eq(clientAuthConfigs.clientId, id))
    .get();

  // Redact the stored secret before handing config to the client component.
  const authConfig = authRow
    ? {
        method: authRow.method,
        enabled: authRow.enabled,
        allowLocalFallback: authRow.allowLocalFallback,
        defaultClientRole: authRow.defaultClientRole,
        roleClaim: authRow.roleClaim,
        roleMapping: authRow.roleMapping ?? null,
        config: authRow.config
          ? {
              ...authRow.config,
              clientSecret:
                typeof authRow.config.clientSecret === "string" &&
                authRow.config.clientSecret
                  ? ""
                  : "",
            }
          : null,
      }
    : null;

  const team = db
    .select()
    .from(users)
    .where(eq(users.clientId, id))
    .all()
    .map((u) => ({
      id: u.id,
      email: u.email,
      clientRole: u.clientRole as "owner" | "manager" | "viewer",
      status: u.status,
      authSource: u.authSource,
    }));

  const endpoint = getTechnitium().buildEndpoint(client.slug, client.endpointBase);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-brand hover:underline">
          ← All accounts
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">{client.name}</h1>
        <p className="text-sm text-slate-500">
          {client.slug}.{client.endpointBase}
        </p>
      </div>

      <DisableControl
        clientId={client.id}
        status={client.status}
        reason={client.disabledReason}
        note={client.disabledNote}
      />

      <Card title="Endpoint" description="Deterministic per-client URLs (slug subdomain).">
        <div className="space-y-1 text-sm">
          <div><span className="inline-block w-12 font-semibold text-slate-500">DoH</span><code>{endpoint.doh}</code></div>
          <div><span className="inline-block w-12 font-semibold text-slate-500">DoT</span><code>{endpoint.dot}</code></div>
          <div><span className="inline-block w-12 font-semibold text-slate-500">DoQ</span><code>{endpoint.doq}</code></div>
        </div>
      </Card>

      <AuthConfigForm clientId={client.id} initial={authConfig} />

      <UsersManager
        apiBase={`/api/admin/clients/${client.id}/users`}
        initial={team}
        currentUserId={null}
        title="Client users"
        description="Manage this client's users on their behalf."
      />
    </div>
  );
}
