import { z } from "zod";
import { POLICY_KEYS } from "./policies";

export const clientRoleSchema = z.enum(["owner", "manager", "viewer"]);

export const createClientSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/, "Invalid DNS label")
    .optional(),
  endpointBase: z.string().min(3).max(253).optional(),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8).max(200).optional(),
});

export const updateClientSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  endpointBase: z.string().min(3).max(253).optional(),
});

export const disableClientSchema = z.object({
  reason: z.enum(["payment_failed", "tos_violation", "abuse", "maintenance", "other"]),
  note: z.string().max(500).optional(),
});

export const authConfigSchema = z.object({
  method: z.enum(["local", "oidc", "saml"]),
  enabled: z.boolean().optional(),
  allowLocalFallback: z.boolean().optional(),
  defaultClientRole: clientRoleSchema.optional(),
  roleClaim: z.string().max(100).nullable().optional(),
  roleMapping: z.record(clientRoleSchema).nullable().optional(),
  config: z.record(z.unknown()).nullable().optional(),
});

export const policiesSchema = z.object({
  policies: z.array(
    z.object({
      key: z.enum(POLICY_KEYS as [string, ...string[]]),
      enabled: z.boolean(),
    }),
  ),
});

export const ruleSchema = z.object({
  kind: z.enum(["allow", "deny"]),
  domain: z.string().min(1).max(253),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200).optional(),
  clientRole: clientRoleSchema,
  authSource: z.enum(["local", "oidc", "saml"]).optional(),
});

export const updateUserSchema = z.object({
  clientRole: clientRoleSchema.optional(),
  status: z.enum(["active", "blocked"]).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
