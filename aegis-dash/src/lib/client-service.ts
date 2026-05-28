import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  clientPolicies,
  clientRules,
  clients,
  users,
  type Client,
} from "@/db/schema";
import { getTechnitium } from "@/lib/technitium";

export function getEnabledPolicies(clientId: number): string[] {
  return db
    .select()
    .from(clientPolicies)
    .where(and(eq(clientPolicies.clientId, clientId), eq(clientPolicies.enabled, true)))
    .all()
    .map((p) => p.policyKey);
}

export function getRules(clientId: number): { allow: string[]; deny: string[] } {
  const rows = db
    .select()
    .from(clientRules)
    .where(eq(clientRules.clientId, clientId))
    .all();
  return {
    allow: rows.filter((r) => r.kind === "allow").map((r) => r.domain),
    deny: rows.filter((r) => r.kind === "deny").map((r) => r.domain),
  };
}

/** Push the client's current policies + rules to the Technitium config. */
export async function syncTechnitiumConfig(client: Client): Promise<void> {
  if (client.status === "disabled") return; // disabled clients have no config
  await getTechnitium().applyClientConfig({
    slug: client.slug,
    endpointBase: client.endpointBase,
    policies: getEnabledPolicies(client.id),
    rules: getRules(client.id),
  });
}

function audit(userId: number | null, action: string, detail?: string) {
  db.insert(auditLog).values({ userId, action, detail }).run();
}

/**
 * Disable a client: mark disabled with a reason, block its users for login
 * gating, and remove the slug entry from the Technitium config. No records are
 * deleted — everything is retained for reactivation.
 */
export async function disableClient(args: {
  client: Client;
  reason: Client["disabledReason"];
  note?: string | null;
  actorUserId: number;
}): Promise<Client> {
  const { client, reason, note, actorUserId } = args;
  const updated = db
    .update(clients)
    .set({
      status: "disabled",
      disabledAt: new Date(),
      disabledReason: reason,
      disabledNote: note ?? null,
    })
    .where(eq(clients.id, client.id))
    .returning()
    .get();

  await getTechnitium().removeClientConfig(client.slug);
  audit(actorUserId, "client.disable", `client=${client.slug} reason=${reason}`);
  return updated;
}

/** Reactivate a client and re-add its config with the retained settings. */
export async function reactivateClient(args: {
  client: Client;
  actorUserId: number;
}): Promise<Client> {
  const { client, actorUserId } = args;
  const updated = db
    .update(clients)
    .set({
      status: "active",
      disabledAt: null,
      disabledReason: null,
      disabledNote: null,
    })
    .where(eq(clients.id, client.id))
    .returning()
    .get();

  await syncTechnitiumConfig(updated);
  audit(actorUserId, "client.reactivate", `client=${client.slug}`);
  return updated;
}

export function clientUserCount(clientId: number): number {
  return db.select().from(users).where(eq(users.clientId, clientId)).all().length;
}
