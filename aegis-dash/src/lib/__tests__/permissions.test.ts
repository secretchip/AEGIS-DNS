import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";

describe("permission matrix", () => {
  it("owner can do everything including managing users", () => {
    for (const cap of [
      "view_stats",
      "provision_endpoint",
      "manage_policies",
      "manage_rules",
      "manage_users",
    ] as const) {
      expect(can("owner", cap)).toBe(true);
    }
  });

  it("manager can manage settings but not users", () => {
    expect(can("manager", "manage_policies")).toBe(true);
    expect(can("manager", "manage_rules")).toBe(true);
    expect(can("manager", "provision_endpoint")).toBe(true);
    expect(can("manager", "manage_users")).toBe(false);
  });

  it("viewer is read-only", () => {
    expect(can("viewer", "view_stats")).toBe(true);
    expect(can("viewer", "manage_policies")).toBe(false);
    expect(can("viewer", "manage_rules")).toBe(false);
    expect(can("viewer", "provision_endpoint")).toBe(false);
    expect(can("viewer", "manage_users")).toBe(false);
  });

  it("null/unknown role has no capabilities", () => {
    expect(can(null, "view_stats")).toBe(false);
    expect(can(undefined, "view_stats")).toBe(false);
  });
});
