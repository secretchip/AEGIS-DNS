/**
 * Per-client role capability matrix. Pure functions only — unit tested.
 */
export type ClientRole = "owner" | "manager" | "viewer";

export type Capability =
  | "view_stats"
  | "provision_endpoint"
  | "manage_policies"
  | "manage_rules"
  | "manage_users";

const MATRIX: Record<ClientRole, Capability[]> = {
  owner: [
    "view_stats",
    "provision_endpoint",
    "manage_policies",
    "manage_rules",
    "manage_users",
  ],
  manager: [
    "view_stats",
    "provision_endpoint",
    "manage_policies",
    "manage_rules",
  ],
  viewer: ["view_stats"],
};

export function can(role: ClientRole | null | undefined, cap: Capability): boolean {
  if (!role) return false;
  return MATRIX[role].includes(cap);
}

export function capabilitiesFor(role: ClientRole): Capability[] {
  return [...MATRIX[role]];
}
