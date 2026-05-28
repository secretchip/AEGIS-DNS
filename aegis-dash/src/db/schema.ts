import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * A client is a tenant. Its `slug` doubles as the DNS endpoint subdomain
 * (e.g. https://<slug>.<endpointBase>/dns-query). The slug and all related
 * records are retained when a client is disabled so the dashboard can still
 * show the endpoint and reactivation can restore it.
 */
export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  endpointBase: text("endpoint_base").notNull(),
  provisionedAt: integer("provisioned_at", { mode: "timestamp" }),
  status: text("status", { enum: ["active", "disabled"] })
    .notNull()
    .default("active"),
  disabledAt: integer("disabled_at", { mode: "timestamp" }),
  disabledReason: text("disabled_reason", {
    enum: ["payment_failed", "tos_violation", "abuse", "maintenance", "other"],
  }),
  disabledNote: text("disabled_note"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * A user belongs either to the platform (platformRole=admin, clientId null) or
 * to a single client (platformRole=client). Within a client the clientRole
 * governs capabilities. SSO users have a null passwordHash and a non-null
 * externalId.
 */
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    platformRole: text("platform_role", { enum: ["admin", "client"] }).notNull(),
    clientId: integer("client_id").references(() => clients.id, {
      onDelete: "cascade",
    }),
    clientRole: text("client_role", { enum: ["owner", "manager", "viewer"] }),
    status: text("status", { enum: ["active", "blocked"] })
      .notNull()
      .default("active"),
    authSource: text("auth_source", { enum: ["local", "oidc", "saml"] })
      .notNull()
      .default("local"),
    externalId: text("external_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
  }),
);

/**
 * Per-client authentication configuration, edited by the platform admin.
 * `config` holds method-specific settings as JSON; secret fields inside it are
 * encrypted at rest via src/lib/crypto.ts.
 */
export const clientAuthConfigs = sqliteTable("client_auth_configs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .unique()
    .references(() => clients.id, { onDelete: "cascade" }),
  method: text("method", { enum: ["local", "oidc", "saml"] })
    .notNull()
    .default("local"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  allowLocalFallback: integer("allow_local_fallback", { mode: "boolean" })
    .notNull()
    .default(true),
  defaultClientRole: text("default_client_role", {
    enum: ["owner", "manager", "viewer"],
  })
    .notNull()
    .default("viewer"),
  roleClaim: text("role_claim"),
  roleMapping: text("role_mapping", { mode: "json" }).$type<
    Record<string, "owner" | "manager" | "viewer">
  >(),
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Which policies/blocklists a client has enabled. */
export const clientPolicies = sqliteTable(
  "client_policies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    policyKey: text("policy_key").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  },
  (t) => ({
    clientPolicyIdx: uniqueIndex("client_policy_idx").on(
      t.clientId,
      t.policyKey,
    ),
  }),
);

/** Per-client allow/deny rules for their own endpoint. */
export const clientRules = sqliteTable(
  "client_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["allow", "deny"] }).notNull(),
    domain: text("domain").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    clientRuleIdx: uniqueIndex("client_rule_idx").on(
      t.clientId,
      t.kind,
      t.domain,
    ),
  }),
);

/** Lightweight audit trail for sensitive actions. */
export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type Client = typeof clients.$inferSelect;
export type User = typeof users.$inferSelect;
export type ClientAuthConfig = typeof clientAuthConfigs.$inferSelect;
export type ClientPolicy = typeof clientPolicies.$inferSelect;
export type ClientRule = typeof clientRules.$inferSelect;
