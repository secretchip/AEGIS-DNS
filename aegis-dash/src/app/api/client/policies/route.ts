import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientPolicies } from "@/db/schema";
import { assertActiveClient, assertCan, handle, json } from "@/lib/api";
import { syncTechnitiumConfig } from "@/lib/client-service";
import { POLICY_CATALOG } from "@/lib/policies";
import { requireClientUser } from "@/lib/session";
import { policiesSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  return handle(async () => {
    const { client } = await requireClientUser();
    const rows = db
      .select()
      .from(clientPolicies)
      .where(eq(clientPolicies.clientId, client.id))
      .all();
    const enabled = new Map(rows.map((r) => [r.policyKey, r.enabled]));
    const policies = POLICY_CATALOG.map((p) => ({
      ...p,
      enabled: enabled.get(p.key) ?? false,
    }));
    return json({ policies });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { user, client } = await requireClientUser();
    assertActiveClient(client);
    assertCan({ user, client }, "manage_policies");

    const { policies } = policiesSchema.parse(await req.json());
    for (const p of policies) {
      const existing = db
        .select()
        .from(clientPolicies)
        .where(and(eq(clientPolicies.clientId, client.id), eq(clientPolicies.policyKey, p.key)))
        .get();
      if (existing) {
        db.update(clientPolicies)
          .set({ enabled: p.enabled })
          .where(eq(clientPolicies.id, existing.id))
          .run();
      } else {
        db.insert(clientPolicies)
          .values({ clientId: client.id, policyKey: p.key, enabled: p.enabled })
          .run();
      }
    }

    await syncTechnitiumConfig(client);
    return json({ ok: true });
  });
}
