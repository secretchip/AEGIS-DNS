import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { HttpError, handle, json } from "@/lib/api";
import { reactivateClient } from "@/lib/client-service";
import { requireAdmin } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const admin = await requireAdmin();
    const id = Number((await params).id);
    const client = db.select().from(clients).where(eq(clients.id, id)).get();
    if (!client) throw new HttpError("not_found", 404);

    const updated = await reactivateClient({ client, actorUserId: admin.user.id });
    return json({ client: updated });
  });
}
