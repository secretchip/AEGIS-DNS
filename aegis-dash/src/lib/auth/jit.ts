import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { resolveRole } from "./role-mapping";
import type { AuthMethodConfig, SsoIdentity } from "./types";

export { resolveRole };

/**
 * Find-or-create the SSO user under the given client. Returns null if a
 * matching user exists but is blocked (login must be refused).
 */
export function provisionSsoUser(args: {
  clientId: number;
  authSource: "oidc" | "saml";
  identity: SsoIdentity;
  cfg: AuthMethodConfig;
}): User | null {
  const { clientId, authSource, identity, cfg } = args;

  // Match first by external id, then by email within this client.
  const byExternal = db
    .select()
    .from(users)
    .where(
      and(eq(users.clientId, clientId), eq(users.externalId, identity.externalId)),
    )
    .get();
  const existing =
    byExternal ??
    db
      .select()
      .from(users)
      .where(and(eq(users.clientId, clientId), eq(users.email, identity.email)))
      .get();

  if (existing) {
    if (existing.status === "blocked") return null;
    // Keep externalId in sync if the user was first created locally.
    if (existing.externalId !== identity.externalId) {
      db.update(users)
        .set({ externalId: identity.externalId, authSource })
        .where(eq(users.id, existing.id))
        .run();
    }
    return { ...existing, externalId: identity.externalId, authSource };
  }

  const role = resolveRole(identity, cfg);
  const inserted = db
    .insert(users)
    .values({
      email: identity.email,
      passwordHash: null,
      platformRole: "client",
      clientId,
      clientRole: role,
      status: "active",
      authSource,
      externalId: identity.externalId,
    })
    .returning()
    .get();
  return inserted;
}
