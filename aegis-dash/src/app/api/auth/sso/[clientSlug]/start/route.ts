import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { loadAuthConfig, startSso } from "@/lib/auth";

export const runtime = "nodejs";

function appBaseUrl(req: Request): string {
  return process.env.APP_BASE_URL ?? new URL(req.url).origin;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientSlug: string }> },
) {
  const { clientSlug } = await params;
  const client = db.select().from(clients).where(eq(clients.slug, clientSlug)).get();
  if (!client) {
    return NextResponse.redirect(new URL("/login?error=unknown_client", appBaseUrl(req)));
  }

  const cfg = loadAuthConfig(client.id);
  if (cfg.method === "local") {
    return NextResponse.redirect(new URL("/login?error=no_sso", appBaseUrl(req)));
  }

  const callbackUrl = `${appBaseUrl(req)}/api/auth/sso/${clientSlug}/callback`;
  try {
    const { redirectUrl, state, verifier } = await startSso(clientSlug, cfg, callbackUrl);
    const res = NextResponse.redirect(redirectUrl);
    res.cookies.set("sso_state", state, { httpOnly: true, sameSite: "lax", path: "/" });
    if (verifier) {
      res.cookies.set("sso_verifier", verifier, { httpOnly: true, sameSite: "lax", path: "/" });
    }
    return res;
  } catch {
    return NextResponse.redirect(new URL("/login?error=sso_unavailable", appBaseUrl(req)));
  }
}
