import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clientPolicies, clientRules } from "@/db/schema";
import { EndpointPanel } from "@/components/client/EndpointPanel";
import { PoliciesPanel } from "@/components/client/PoliciesPanel";
import { RulesPanel } from "@/components/client/RulesPanel";
import { StatsPanel } from "@/components/client/StatsPanel";
import { UsersManager } from "@/components/UsersManager";
import { SuspendedOverlay } from "@/components/SuspendedOverlay";
import { listClientUsers } from "@/lib/user-service";
import { can } from "@/lib/permissions";
import { POLICY_CATALOG } from "@/lib/policies";
import { requireClientUser } from "@/lib/session";
import { computeClientStats } from "@/lib/stats";
import { getTechnitium } from "@/lib/technitium";

export const dynamic = "force-dynamic";

export default async function ClientDashboard() {
  const { user, client } = await requireClientUser();
  const role = user.clientRole;
  const disabled = client.status === "disabled";

  const tech = getTechnitium();
  const endpoint = tech.buildEndpoint(client.slug, client.endpointBase);
  const rawStats = await tech.getClientStats(client.id, client.slug, "LastDay");
  const stats = computeClientStats(rawStats);

  const enabled = new Map(
    db
      .select()
      .from(clientPolicies)
      .where(eq(clientPolicies.clientId, client.id))
      .all()
      .map((p) => [p.policyKey, p.enabled]),
  );
  const policies = POLICY_CATALOG.map((p) => ({
    ...p,
    enabled: enabled.get(p.key) ?? false,
  }));

  const rules = db
    .select()
    .from(clientRules)
    .where(eq(clientRules.clientId, client.id))
    .all()
    .map((r) => ({ id: r.id, kind: r.kind, domain: r.domain }));

  const canManageUsers = can(role, "manage_users");
  const team = canManageUsers
    ? listClientUsers(client.id).map((u) => ({
        id: u.id,
        email: u.email,
        clientRole: u.clientRole as "owner" | "manager" | "viewer",
        status: u.status,
        authSource: u.authSource,
      }))
    : [];

  return (
    <div className="space-y-6">
      {disabled && (
        <SuspendedOverlay reason={client.disabledReason} note={client.disabledNote} />
      )}

      <StatsPanel initial={stats} initialRange="LastDay" />

      <div className="grid gap-6 lg:grid-cols-2">
        <EndpointPanel
          endpoint={endpoint}
          provisioned={Boolean(client.provisionedAt)}
          canProvision={can(role, "provision_endpoint")}
          disabled={disabled}
        />
        <PoliciesPanel
          initial={policies}
          canManage={can(role, "manage_policies")}
          disabled={disabled}
        />
      </div>

      <RulesPanel initial={rules} canManage={can(role, "manage_rules")} disabled={disabled} />

      {canManageUsers && (
        <UsersManager
          apiBase="/api/client/users"
          initial={team}
          currentUserId={user.id}
          disabled={disabled}
        />
      )}
    </div>
  );
}
