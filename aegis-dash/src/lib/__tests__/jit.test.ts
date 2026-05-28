import { describe, expect, it } from "vitest";
import { resolveRole } from "@/lib/auth/role-mapping";
import type { AuthMethodConfig, SsoIdentity } from "@/lib/auth/types";

const identity = (claims: Record<string, unknown>): SsoIdentity => ({
  externalId: "sub-1",
  email: "user@globex.example",
  claims,
});

const cfg = (over: Partial<AuthMethodConfig>): AuthMethodConfig => ({
  method: "oidc",
  allowLocalFallback: false,
  defaultClientRole: "viewer",
  roleClaim: null,
  roleMapping: null,
  config: null,
  ...over,
});

describe("resolveRole (JIT provisioning)", () => {
  it("falls back to defaultClientRole when no mapping is configured", () => {
    expect(resolveRole(identity({ groups: ["x"] }), cfg({}))).toBe("viewer");
  });

  it("maps a string claim value to a role", () => {
    const c = cfg({ roleClaim: "role", roleMapping: { admin: "owner" } });
    expect(resolveRole(identity({ role: "admin" }), c)).toBe("owner");
  });

  it("maps the first matching value from an array claim", () => {
    const c = cfg({
      roleClaim: "groups",
      roleMapping: { "dns-managers": "manager", "dns-admins": "owner" },
    });
    expect(resolveRole(identity({ groups: ["other", "dns-managers"] }), c)).toBe("manager");
  });

  it("uses default when the claim value isn't in the mapping", () => {
    const c = cfg({
      roleClaim: "groups",
      roleMapping: { "dns-admins": "owner" },
      defaultClientRole: "viewer",
    });
    expect(resolveRole(identity({ groups: ["nobody"] }), c)).toBe("viewer");
  });
});
