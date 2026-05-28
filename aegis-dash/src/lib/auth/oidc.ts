import { createHash, randomBytes } from "node:crypto";
import { decryptSecret, isEncrypted } from "@/lib/crypto";
import type { AuthMethodConfig, SsoIdentity, SsoStartResult } from "./types";

/**
 * OIDC Authorization-Code + PKCE provider. Provider settings are loaded per
 * client from the DB at request time, so a new tenant's IdP can be added with
 * no code change.
 *
 * When AUTH_MODE=mock the IdP round-trip is simulated locally (no network), so
 * the SSO + JIT flow is testable offline. In that mode the "authorize" step
 * redirects straight back to our own callback with a synthetic code.
 */

interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes?: string;
}

function readConfig(cfg: AuthMethodConfig): OidcConfig {
  const c = (cfg.config ?? {}) as Record<string, unknown>;
  const rawSecret = String(c.clientSecret ?? "");
  return {
    issuer: String(c.issuer ?? ""),
    clientId: String(c.clientId ?? ""),
    clientSecret: isEncrypted(rawSecret) ? decryptSecret(rawSecret) : rawSecret,
    scopes: c.scopes ? String(c.scopes) : "openid email profile",
  };
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isMockMode(): boolean {
  return (process.env.AUTH_MODE ?? "mock") !== "live";
}

export async function startOidc(
  clientSlug: string,
  cfg: AuthMethodConfig,
  callbackUrl: string,
): Promise<SsoStartResult> {
  const state = base64url(randomBytes(16));
  const verifier = base64url(randomBytes(32));

  if (isMockMode()) {
    // Simulated IdP: bounce straight back to our callback with a code we mint.
    const url = new URL(callbackUrl);
    url.searchParams.set("code", `mock-${clientSlug}`);
    url.searchParams.set("state", state);
    return { redirectUrl: url.toString(), state, verifier };
  }

  const oidc = readConfig(cfg);
  if (!oidc.issuer || !oidc.clientId) {
    throw new Error("OIDC issuer and clientId are required.");
  }
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  // Discovery: most IdPs expose authorize at {issuer}/authorize or via
  // .well-known. We use the conventional path; a full openid-client discovery
  // call is the production upgrade path (left as the live wiring point).
  const authorize = new URL(`${oidc.issuer.replace(/\/$/, "")}/authorize`);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", oidc.clientId);
  authorize.searchParams.set("redirect_uri", callbackUrl);
  authorize.searchParams.set("scope", oidc.scopes ?? "openid email profile");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  return { redirectUrl: authorize.toString(), state, verifier };
}

export async function completeOidc(
  clientSlug: string,
  cfg: AuthMethodConfig,
  params: { code: string; verifier?: string },
): Promise<SsoIdentity> {
  if (isMockMode()) {
    // Synthesize a deterministic identity for the mock IdP.
    const email = `sso-user@${clientSlug}.example`;
    return {
      externalId: `mock|${clientSlug}|${params.code}`,
      email,
      claims: { email, groups: ["dns-viewers"] },
    };
  }

  // Production wiring point: exchange `code` at {issuer}/token with PKCE
  // `verifier`, validate the id_token, and read claims. Use the `openid-client`
  // package for discovery + token validation.
  throw new Error(
    "Live OIDC token exchange is not wired yet. Set AUTH_MODE=mock for local " +
      "development, or implement the token exchange against your IdP.",
  );
}
