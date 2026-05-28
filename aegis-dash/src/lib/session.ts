import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { db } from "@/db";
import { clients, users, type Client, type User } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sessionOptions, type SessionData } from "./session-config";

export { sessionOptions, type SessionData };

export async function getSession() {
  const password = sessionOptions.password;
  if (typeof password !== "string" || password.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters.");
  }
  const store = await cookies();
  return getIronSession<SessionData>(store, sessionOptions);
}

export interface CurrentUser {
  user: User;
  client: Client | null;
}

/** Resolve the logged-in user (and their client), or null if unauthenticated. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session.userId) return null;

  const user = db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .get();
  if (!user || user.status === "blocked") return null;

  let client: Client | null = null;
  if (user.clientId) {
    client = db.select().from(clients).where(eq(clients.id, user.clientId)).get() ?? null;
  }
  return { user, client };
}

export async function requireUser(): Promise<CurrentUser> {
  const current = await getCurrentUser();
  if (!current) throw new UnauthorizedError();
  return current;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const current = await requireUser();
  if (current.user.platformRole !== "admin") throw new ForbiddenError();
  return current;
}

export async function requireClientUser(): Promise<CurrentUser & { client: Client }> {
  const current = await requireUser();
  if (current.user.platformRole !== "client" || !current.client) {
    throw new ForbiddenError();
  }
  return current as CurrentUser & { client: Client };
}

export class UnauthorizedError extends Error {
  status = 401;
  code = "unauthorized";
}
export class ForbiddenError extends Error {
  status = 403;
  code = "forbidden";
}
export class SuspendedError extends Error {
  status = 403;
  code = "account_suspended";
}
