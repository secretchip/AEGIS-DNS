import type { ClientRole } from "@/lib/permissions";

/** Identity claims returned by an SSO provider after a successful login. */
export interface SsoIdentity {
  /** Stable IdP subject identifier. */
  externalId: string;
  email: string;
  /** Raw claims, used for role mapping. */
  claims: Record<string, unknown>;
}

export interface SsoStartResult {
  /** URL to redirect the browser to (IdP authorize endpoint). */
  redirectUrl: string;
  /** Opaque state to persist (cookie) and verify on callback. */
  state: string;
  /** PKCE verifier / nonce to persist for the callback, if any. */
  verifier?: string;
  nonce?: string;
}

export interface AuthMethodConfig {
  method: "local" | "oidc" | "saml";
  allowLocalFallback: boolean;
  defaultClientRole: ClientRole;
  roleClaim?: string | null;
  roleMapping?: Record<string, ClientRole> | null;
  config?: Record<string, unknown> | null;
}
