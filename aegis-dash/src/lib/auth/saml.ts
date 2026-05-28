import type { AuthMethodConfig, SsoIdentity, SsoStartResult } from "./types";

/**
 * SAML SP-initiated flow — structured stub. The data model and routing already
 * support it; wiring uses `@node-saml/node-saml` with entryPoint/issuer/cert
 * read from the per-client config. Left unimplemented intentionally for this
 * foundation iteration.
 */
export async function startSaml(
  _clientSlug: string,
  _cfg: AuthMethodConfig,
  _callbackUrl: string,
): Promise<SsoStartResult> {
  throw new Error(
    "SAML login is not wired yet. Configure OIDC, or implement the SAML " +
      "provider with @node-saml/node-saml using the client's config.",
  );
}

export async function completeSaml(
  _clientSlug: string,
  _cfg: AuthMethodConfig,
  _params: Record<string, string>,
): Promise<SsoIdentity> {
  throw new Error("SAML assertion handling is not wired yet.");
}
