import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { assertActiveClient, assertCan, handle, json } from "@/lib/api";
import { syncTechnitiumConfig } from "@/lib/client-service";
import { requireClientUser } from "@/lib/session";
import { getTechnitium } from "@/lib/technitium";

export const runtime = "nodejs";

export async function POST() {
  return handle(async () => {
    const { user, client } = await requireClientUser();
    assertActiveClient(client);
    assertCan({ user, client }, "provision_endpoint");

    let current = client;
    if (!current.provisionedAt) {
      current = db
        .update(clients)
        .set({ provisionedAt: new Date() })
        .where(eq(clients.id, client.id))
        .returning()
        .get();
      await syncTechnitiumConfig(current);
    }

    const endpoint = getTechnitium().buildEndpoint(current.slug, current.endpointBase);
    return json({ provisionedAt: current.provisionedAt, endpoint });
  });
}
