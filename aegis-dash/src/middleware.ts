import { getIronSession } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";
import { sessionOptions, type SessionData } from "@/lib/session-config";

const PROTECTED_PREFIXES = ["/admin", "/dashboard"];

/**
 * Coarse session gate: redirects unauthenticated users away from protected
 * pages and authenticated users away from /login. Fine-grained role checks and
 * the suspended-client overlay are enforced in the server components/routes
 * (which can hit the DB).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  const authed = Boolean(session.userId);

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isProtected && !authed) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && authed) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/", "/login", "/admin/:path*", "/dashboard/:path*"],
};
