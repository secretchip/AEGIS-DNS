import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clientAuthConfigs,
  clientPolicies,
  clientRules,
  clients,
  users,
} from "@/db/schema";
import { HttpError, handle, json } from "@/lib/api";
import { syncTechnitiumConfig } from "@/lib/client-service";
import { requireAdmin } from "@/lib/session";
import { updateClientSchema } from "@/lib/validation";

export const runtime = "nodejs";

function getClientOr404(id: number) {
  const client = db.select().from(clients).where(eq(clients.id, id)).get();
  if (!client) throw new HttpError("not_found", 404);
  return client;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireAdmin();
    const id = Number((await params).id);
    const client = getClientOr404(id);
    const authConfig = db
      .select()
      .from(clientAuthConfigs)
      .where(eq(clientAuthConfigs.clientId, id))
      .get();
    const clientUsers = db.select().from(users).where(eq(users.clientId, id)).all();
    const policies = db
      .select()
      .from(clientPolicies)
      .where(eq(clientPolicies.clientId, id))
      .all();
    const rules = db.select().from(clientRules).where(eq(clientRules.clientId, id)).all();
    return json({ client, authConfig, users: clientUsers, policies, rules });
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireAdmin();
    const id = Number((await params).id);
    const client = getClientOr404(id);
    const input = updateClientSchema.parse(await req.json());

    const updated = db
      .update(clients)
      .set({
        ...(input.name ? { name: input.name } : {}),
        ...(input.endpointBase ? { endpointBase: input.endpointBase } : {}),
      })
      .where(eq(clients.id, id))
      .returning()
      .get();

    // endpointBase change rewrites the Technitium config (when active).
    if (input.endpointBase && input.endpointBase !== client.endpointBase) {
      await syncTechnitiumConfig(updated);
    }
    return json({ client: updated });
  });
}
