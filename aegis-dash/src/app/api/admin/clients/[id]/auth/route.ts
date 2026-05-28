import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clientAuthConfigs, clients } from "@/db/schema";
import { HttpError, handle, json } from "@/lib/api";
import { encryptSecret, isEncrypted } from "@/lib/crypto";
import { requireAdmin } from "@/lib/session";
import { authConfigSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Encrypt the clientSecret inside an OIDC config before persisting. */
function protectConfig(
  config: Record<string, unknown> | null | undefined,
  previous: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!config) return null;
  const next = { ...config };
  const secret = next.clientSecret;
  if (typeof secret === "string" && secret.length > 0 && !isEncrypted(secret)) {
    next.clientSecret = encryptSecret(secret);
  } else if (secret === undefined || secret === "") {
    // Preserve the existing secret if the form left it blank.
    const prev = previous?.clientSecret;
    if (typeof prev === "string") next.clientSecret = prev;
  }
  return next;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireAdmin();
    const id = Number((await params).id);
    const cfg = db
      .select()
      .from(clientAuthConfigs)
      .where(eq(clientAuthConfigs.clientId, id))
      .get();
    // Never return secrets to the browser — redact.
    const config = cfg?.config ? { ...cfg.config } : null;
    if (config && typeof config.clientSecret === "string") {
      config.clientSecret = config.clientSecret ? "********" : "";
    }
    return json({ authConfig: cfg ? { ...cfg, config } : null });
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireAdmin();
    const id = Number((await params).id);
    if (!db.select().from(clients).where(eq(clients.id, id)).get()) {
      throw new HttpError("not_found", 404);
    }
    const input = authConfigSchema.parse(await req.json());

    const existing = db
      .select()
      .from(clientAuthConfigs)
      .where(eq(clientAuthConfigs.clientId, id))
      .get();

    // Ignore redaction sentinel coming back from the GET payload.
    let incomingConfig = input.config ?? null;
    if (incomingConfig && incomingConfig.clientSecret === "********") {
      incomingConfig = { ...incomingConfig, clientSecret: "" };
    }
    const config = protectConfig(incomingConfig, existing?.config ?? null);

    const values = {
      clientId: id,
      method: input.method,
      enabled: input.enabled ?? existing?.enabled ?? true,
      allowLocalFallback: input.allowLocalFallback ?? existing?.allowLocalFallback ?? true,
      defaultClientRole: input.defaultClientRole ?? existing?.defaultClientRole ?? "viewer",
      roleClaim: input.roleClaim ?? null,
      roleMapping: input.roleMapping ?? null,
      config,
      updatedAt: new Date(),
    };

    const saved = existing
      ? db
          .update(clientAuthConfigs)
          .set(values)
          .where(eq(clientAuthConfigs.clientId, id))
          .returning()
          .get()
      : db.insert(clientAuthConfigs).values(values).returning().get();

    const redacted = saved.config ? { ...saved.config } : null;
    if (redacted && typeof redacted.clientSecret === "string") {
      redacted.clientSecret = redacted.clientSecret ? "********" : "";
    }
    return json({ authConfig: { ...saved, config: redacted } });
  });
}
