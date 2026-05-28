import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientRules } from "@/db/schema";
import { HttpError, assertActiveClient, assertCan, handle, json } from "@/lib/api";
import { syncTechnitiumConfig } from "@/lib/client-service";
import { requireClientUser } from "@/lib/session";
import { isValidDomain } from "@/lib/slug";
import { ruleSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  return handle(async () => {
    const { client } = await requireClientUser();
    const rules = db
      .select()
      .from(clientRules)
      .where(eq(clientRules.clientId, client.id))
      .all();
    return json({ rules });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { user, client } = await requireClientUser();
    assertActiveClient(client);
    assertCan({ user, client }, "manage_rules");

    const { kind, domain } = ruleSchema.parse(await req.json());
    const normalized = domain.trim().toLowerCase();
    if (!isValidDomain(normalized)) throw new HttpError("invalid_domain", 400);

    const existing = db
      .select()
      .from(clientRules)
      .where(
        and(
          eq(clientRules.clientId, client.id),
          eq(clientRules.kind, kind),
          eq(clientRules.domain, normalized),
        ),
      )
      .get();
    if (existing) throw new HttpError("duplicate_rule", 409);

    const rule = db
      .insert(clientRules)
      .values({ clientId: client.id, kind, domain: normalized })
      .returning()
      .get();

    await syncTechnitiumConfig(client);
    return json({ rule }, { status: 201 });
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const { user, client } = await requireClientUser();
    assertActiveClient(client);
    assertCan({ user, client }, "manage_rules");

    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!id) throw new HttpError("invalid_request", 400);

    const rule = db
      .select()
      .from(clientRules)
      .where(and(eq(clientRules.id, id), eq(clientRules.clientId, client.id)))
      .get();
    if (!rule) throw new HttpError("not_found", 404);

    db.delete(clientRules).where(eq(clientRules.id, id)).run();
    await syncTechnitiumConfig(client);
    return json({ ok: true });
  });
}
