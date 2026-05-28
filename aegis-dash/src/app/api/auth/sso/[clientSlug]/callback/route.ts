import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { completeSso, loadAuthConfig, provisionSsoUser } from "@/lib/auth";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

function appBaseUrl(req: Request): string {
  return process.env.APP_BASE_URL ?? new URL(req.url).origin;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientSlug: string }> },
) {
  const { clientSlug } = await params;
  const base = appBaseUrl(req);
  const url = new URL(req.url);
  const loginRedirect = (err: string) =>
    NextResponse.redirect(new URL(`/login?error=${err}`, base));

  const client = db.select().from(clients).where(eq(clients.slug, clientSlug)).get();
  if (!client) return loginRedirect("unknown_client");

  // Verify state against the cookie set at start.
  const cookieState = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("sso_state="))
    ?.split("=")[1];
  const verifier = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("sso_verifier="))
    ?.split("=")[1];

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code || state !== cookieState) {
    return loginRedirect("sso_state_mismatch");
  }

  const cfg = loadAuthConfig(client.id);
  let identity;
  try {
    identity = await completeSso(clientSlug, cfg, { code, verifier });
  } catch {
    return loginRedirect("sso_failed");
  }

  const user = provisionSsoUser({
    clientId: client.id,
    authSource: cfg.method === "saml" ? "saml" : "oidc",
    identity,
    cfg,
  });
  if (!user) return loginRedirect("user_blocked");

  const session = await getSession();
  session.userId = user.id;
  await session.save();

  const res = NextResponse.redirect(new URL("/dashboard", base));
  res.cookies.delete("sso_state");
  res.cookies.delete("sso_verifier");
  return res;
}
