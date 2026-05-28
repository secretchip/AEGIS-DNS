import type { ClientRole } from "@/lib/permissions";
import type { AuthMethodConfig, SsoIdentity } from "./types";

/**
 * Resolve which client role a JIT-provisioned SSO user should get. Pure +
 * unit-tested: reads the configured claim from the identity and maps it via
 * roleMapping, falling back to defaultClientRole.
 */
export function resolveRole(
  identity: SsoIdentity,
  cfg: AuthMethodConfig,
): ClientRole {
  if (cfg.roleClaim && cfg.roleMapping) {
    const raw = identity.claims[cfg.roleClaim];
    const values = Array.isArray(raw) ? raw.map(String) : [String(raw ?? "")];
    for (const v of values) {
      const mapped = cfg.roleMapping[v];
      if (mapped) return mapped;
    }
  }
  return cfg.defaultClientRole;
}
