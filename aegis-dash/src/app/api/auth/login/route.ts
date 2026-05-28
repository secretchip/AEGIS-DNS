import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, users } from "@/db/schema";
import { apiError, handle, json } from "@/lib/api";
import { loadAuthConfig, localLoginAllowed } from "@/lib/auth";
import { verifyPassword } from "@/lib/auth/password";
import { getSession } from "@/lib/session";
import { loginSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return handle(async () => {
    const { email, password } = loginSchema.parse(await req.json());

    const user = db.select().from(users).where(eq(users.email, email)).get();
    if (!user || user.status === "blocked") {
      return apiError("invalid_credentials", 401);
    }

    // Client users must have local login permitted by their client's config.
    if (user.platformRole === "client") {
      if (!user.clientId) return apiError("invalid_credentials", 401);
      const cfg = loadAuthConfig(user.clientId);
      if (!localLoginAllowed(cfg)) {
        return apiError("sso_required", 400, { method: cfg.method });
      }
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      return apiError("invalid_credentials", 401);
    }

    const session = await getSession();
    session.userId = user.id;
    await session.save();

    const redirect =
      user.platformRole === "admin" ? "/admin" : "/dashboard";
    return json({ ok: true, redirect });
  });
}

// Expose the resolved auth method for a given email so the login form can
// switch between password and "Sign in with SSO".
export async function GET(req: Request) {
  return handle(async () => {
    const email = new URL(req.url).searchParams.get("email")?.trim();
    if (!email) return json({ method: "local", localAllowed: true });
    const user = db.select().from(users).where(eq(users.email, email)).get();
    if (!user || user.platformRole === "admin" || !user.clientId) {
      return json({ method: "local", localAllowed: true });
    }
    const client = db.select().from(clients).where(eq(clients.id, user.clientId)).get();
    const cfg = loadAuthConfig(user.clientId);
    return json({
      method: cfg.method,
      localAllowed: localLoginAllowed(cfg),
      clientSlug: client?.slug ?? null,
    });
  });
}
