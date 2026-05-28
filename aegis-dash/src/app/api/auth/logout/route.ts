import { handle, json } from "@/lib/api";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  return handle(async () => {
    const session = await getSession();
    session.destroy();
    return json({ ok: true, redirect: "/login" });
  });
}
