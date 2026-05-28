import type { SessionOptions } from "iron-session";

/** Edge-safe session config (no DB imports) — shared by middleware + server. */
export interface SessionData {
  userId?: number;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? "",
  cookieName: "aegis_dash_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
};
