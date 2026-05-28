import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { HttpError } from "@/lib/api";
import type { ClientRole } from "@/lib/permissions";

export function listClientUsers(clientId: number): User[] {
  return db.select().from(users).where(eq(users.clientId, clientId)).all();
}

function activeOwnerCount(clientId: number, excludeUserId?: number): number {
  return db
    .select()
    .from(users)
    .where(and(eq(users.clientId, clientId), eq(users.clientRole, "owner")))
    .all()
    .filter((u) => u.status === "active" && u.id !== excludeUserId).length;
}

export async function createClientUser(args: {
  clientId: number;
  email: string;
  password?: string;
  clientRole: ClientRole;
  authSource?: "local" | "oidc" | "saml";
}): Promise<User> {
  const { clientId, email, password, clientRole } = args;
  const authSource = args.authSource ?? (password ? "local" : "oidc");

  const existing = db.select().from(users).where(eq(users.email, email)).get();
  if (existing) throw new HttpError("email_taken", 409);
  if (authSource === "local" && !password) {
    throw new HttpError("password_required", 400);
  }

  return db
    .insert(users)
    .values({
      email,
      passwordHash: password ? await hashPassword(password) : null,
      platformRole: "client",
      clientId,
      clientRole,
      status: "active",
      authSource,
    })
    .returning()
    .get();
}

/** Find a user that must belong to the given client. */
function getScopedUser(clientId: number, userId: number): User {
  const user = db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.clientId, clientId)))
    .get();
  if (!user) throw new HttpError("not_found", 404);
  return user;
}

export async function updateClientUser(args: {
  clientId: number;
  userId: number;
  actorUserId: number;
  clientRole?: ClientRole;
  status?: "active" | "blocked";
}): Promise<User> {
  const { clientId, userId, actorUserId } = args;
  const target = getScopedUser(clientId, userId);

  if ((args.status === "blocked" || args.clientRole) && userId === actorUserId) {
    // Prevent self block / self role-change lockout.
    if (args.status === "blocked") throw new HttpError("cannot_modify_self", 400);
  }

  // Don't allow removing the last active owner (by blocking or demoting).
  const losingOwner =
    target.clientRole === "owner" &&
    ((args.clientRole && args.clientRole !== "owner") || args.status === "blocked");
  if (losingOwner && activeOwnerCount(clientId, userId) === 0) {
    throw new HttpError("last_owner", 400);
  }

  return db
    .update(users)
    .set({
      ...(args.clientRole ? { clientRole: args.clientRole } : {}),
      ...(args.status ? { status: args.status } : {}),
    })
    .where(eq(users.id, userId))
    .returning()
    .get();
}

export function deleteClientUser(args: {
  clientId: number;
  userId: number;
  actorUserId: number;
}): void {
  const { clientId, userId, actorUserId } = args;
  if (userId === actorUserId) throw new HttpError("cannot_modify_self", 400);
  const target = getScopedUser(clientId, userId);
  if (target.clientRole === "owner" && activeOwnerCount(clientId, userId) === 0) {
    throw new HttpError("last_owner", 400);
  }
  db.delete(users).where(eq(users.id, userId)).run();
}
