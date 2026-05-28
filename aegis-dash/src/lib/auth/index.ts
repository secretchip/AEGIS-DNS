import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clientAuthConfigs, type ClientAuthConfig } from "@/db/schema";
import type { ClientRole } from "@/lib/permissions";
import { completeOidc, startOidc } from "./oidc";
import { completeSaml, startSaml } from "./saml";
import type { AuthMethodConfig, SsoIdentity, SsoStartResult } from "./types";

/** Load (or default) the per-client auth configuration. */
export function loadAuthConfig(clientId: number): AuthMethodConfig {
  const row: ClientAuthConfig | undefined = db
    .select()
    .from(clientAuthConfigs)
    .where(eq(clientAuthConfigs.clientId, clientId))
    .get();

  if (!row) {
    return {
      method: "local",
      allowLocalFallback: true,
      defaultClientRole: "viewer",
      roleClaim: null,
      roleMapping: null,
      config: null,
    };
  }
  return {
    method: row.method,
    allowLocalFallback: row.allowLocalFallback,
    defaultClientRole: row.defaultClientRole as ClientRole,
    roleClaim: row.roleClaim,
    roleMapping: row.roleMapping ?? null,
    config: row.config ?? null,
  };
}

/** Whether the local password form should be offered for a client. */
export function localLoginAllowed(cfg: AuthMethodConfig): boolean {
  return cfg.method === "local" || cfg.allowLocalFallback;
}

export async function startSso(
  clientSlug: string,
  cfg: AuthMethodConfig,
  callbackUrl: string,
): Promise<SsoStartResult> {
  if (cfg.method === "oidc") return startOidc(clientSlug, cfg, callbackUrl);
  if (cfg.method === "saml") return startSaml(clientSlug, cfg, callbackUrl);
  throw new Error(`Client auth method "${cfg.method}" does not support SSO.`);
}

export async function completeSso(
  clientSlug: string,
  cfg: AuthMethodConfig,
  params: { code?: string; verifier?: string } & Record<string, string | undefined>,
): Promise<SsoIdentity> {
  if (cfg.method === "oidc") {
    return completeOidc(clientSlug, cfg, {
      code: params.code ?? "",
      verifier: params.verifier,
    });
  }
  if (cfg.method === "saml") {
    return completeSaml(clientSlug, cfg, params as Record<string, string>);
  }
  throw new Error(`Client auth method "${cfg.method}" does not support SSO.`);
}

export { resolveRole, provisionSsoUser } from "./jit";
export type { AuthMethodConfig, SsoIdentity, SsoStartResult } from "./types";
