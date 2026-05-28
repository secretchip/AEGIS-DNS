/**
 * Seeds demo data: a platform admin, a local-auth client (Acme) with three
 * permission tiers, and an OIDC (mock SSO) client (Globex). Also writes the
 * Technitium config for active clients so the mock config files exist.
 *
 * Re-runnable: clears the relevant tables first.
 */
import "./load-env";
import { db } from "./index";
import {
  clientAuthConfigs,
  clientPolicies,
  clientRules,
  clients,
  users,
} from "./schema";
import { hashPassword } from "@/lib/auth/password";
import { POLICY_CATALOG } from "@/lib/policies";
import { syncTechnitiumConfig } from "@/lib/client-service";

const DEV_PASSWORD = process.env.SEED_PASSWORD ?? "Password123!";
const ENDPOINT_BASE = process.env.ENDPOINT_BASE ?? "dns.secretchip.net";

async function main() {
  // Clear (children first due to FKs).
  db.delete(clientRules).run();
  db.delete(clientPolicies).run();
  db.delete(clientAuthConfigs).run();
  db.delete(users).run();
  db.delete(clients).run();

  const pwHash = await hashPassword(DEV_PASSWORD);

  // Platform admin
  db.insert(users)
    .values({
      email: "admin@secretchip.net",
      passwordHash: pwHash,
      platformRole: "admin",
    })
    .run();

  // --- Acme: local auth, three tiers ---
  const acme = db
    .insert(clients)
    .values({
      name: "Acme Corp",
      slug: "acme",
      endpointBase: ENDPOINT_BASE,
      provisionedAt: new Date(),
      status: "active",
    })
    .returning()
    .get();

  db.insert(clientAuthConfigs)
    .values({ clientId: acme.id, method: "local", defaultClientRole: "viewer" })
    .run();

  for (const [email, role] of [
    ["owner@acme.test", "owner"],
    ["manager@acme.test", "manager"],
    ["viewer@acme.test", "viewer"],
  ] as const) {
    db.insert(users)
      .values({
        email,
        passwordHash: pwHash,
        platformRole: "client",
        clientId: acme.id,
        clientRole: role,
        authSource: "local",
      })
      .run();
  }

  // Policy catalog for Acme; enable a few so the config write has content.
  const acmeEnabled = new Set(["block", "ads", "malware", "phishing"]);
  for (const p of POLICY_CATALOG) {
    db.insert(clientPolicies)
      .values({ clientId: acme.id, policyKey: p.key, enabled: acmeEnabled.has(p.key) })
      .run();
  }
  db.insert(clientRules)
    .values([
      { clientId: acme.id, kind: "allow", domain: "internal.acme.test" },
      { clientId: acme.id, kind: "deny", domain: "ads.example.com" },
    ])
    .run();

  // --- Globex: OIDC (mock SSO) ---
  const globex = db
    .insert(clients)
    .values({
      name: "Globex",
      slug: "globex",
      endpointBase: ENDPOINT_BASE,
      provisionedAt: new Date(),
      status: "active",
    })
    .returning()
    .get();

  db.insert(clientAuthConfigs)
    .values({
      clientId: globex.id,
      method: "oidc",
      enabled: true,
      allowLocalFallback: false,
      defaultClientRole: "viewer",
      roleClaim: "groups",
      roleMapping: { "dns-admins": "owner", "dns-managers": "manager" },
      config: {
        issuer: "https://idp.globex.example",
        clientId: "aegis-dash",
        clientSecret: "",
        scopes: "openid email profile groups",
      },
    })
    .run();

  for (const p of POLICY_CATALOG) {
    db.insert(clientPolicies)
      .values({ clientId: globex.id, policyKey: p.key, enabled: p.key === "block" })
      .run();
  }

  // Write mock Technitium config for active clients.
  await syncTechnitiumConfig(acme);
  await syncTechnitiumConfig(globex);

  console.log("Seed complete.");
  console.log(`  admin:   admin@secretchip.net / ${DEV_PASSWORD}`);
  console.log(`  Acme:    owner@acme.test, manager@acme.test, viewer@acme.test / ${DEV_PASSWORD}`);
  console.log(`  Globex:  OIDC mock SSO (no password) — use "Sign in with SSO"`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
