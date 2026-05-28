import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clientAuthConfigs, clientPolicies, clients, users } from "@/db/schema";
import { HttpError, handle, json } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { syncTechnitiumConfig } from "@/lib/client-service";
import { POLICY_CATALOG } from "@/lib/policies";
import { requireAdmin } from "@/lib/session";
import { slugify } from "@/lib/slug";
import { createClientSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const rows = db.select().from(clients).all();
    const result = rows.map((c) => {
      const cfg = db
        .select()
        .from(clientAuthConfigs)
        .where(eq(clientAuthConfigs.clientId, c.id))
        .get();
      const owner = db
        .select()
        .from(users)
        .where(eq(users.clientId, c.id))
        .all()
        .find((u) => u.clientRole === "owner");
      const enabledPolicies = db
        .select()
        .from(clientPolicies)
        .where(eq(clientPolicies.clientId, c.id))
        .all()
        .filter((p) => p.enabled).length;
      return {
        ...c,
        authMethod: cfg?.method ?? "local",
        ownerEmail: owner?.email ?? null,
        enabledPolicies,
      };
    });
    return json({ clients: result });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireAdmin();
    const input = createClientSchema.parse(await req.json());

    const slug = slugify(input.slug ?? input.name);
    if (!slug) throw new HttpError("invalid_slug", 400);
    if (db.select().from(clients).where(eq(clients.slug, slug)).get()) {
      throw new HttpError("slug_taken", 409);
    }
    if (db.select().from(users).where(eq(users.email, input.ownerEmail)).get()) {
      throw new HttpError("email_taken", 409);
    }

    const endpointBase =
      input.endpointBase ?? process.env.ENDPOINT_BASE ?? "dns.secretchip.net";

    const client = db
      .insert(clients)
      .values({ name: input.name, slug, endpointBase, status: "active" })
      .returning()
      .get();

    db.insert(clientAuthConfigs)
      .values({ clientId: client.id, method: "local", defaultClientRole: "viewer" })
      .run();

    for (const p of POLICY_CATALOG) {
      db.insert(clientPolicies)
        .values({ clientId: client.id, policyKey: p.key, enabled: false })
        .run();
    }

    db.insert(users)
      .values({
        email: input.ownerEmail,
        passwordHash: input.ownerPassword
          ? await hashPassword(input.ownerPassword)
          : null,
        platformRole: "client",
        clientId: client.id,
        clientRole: "owner",
        authSource: input.ownerPassword ? "local" : "oidc",
      })
      .run();

    await syncTechnitiumConfig(client);
    return json({ client }, { status: 201 });
  });
}
