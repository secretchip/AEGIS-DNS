import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { HttpError, handle, json } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { createUserSchema } from "@/lib/validation";
import { createClientUser, listClientUsers } from "@/lib/user-service";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireAdmin();
    const id = Number((await params).id);
    return json({ users: listClientUsers(id) });
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireAdmin();
    const id = Number((await params).id);
    if (!db.select().from(clients).where(eq(clients.id, id)).get()) {
      throw new HttpError("not_found", 404);
    }
    const input = createUserSchema.parse(await req.json());
    const user = await createClientUser({ clientId: id, ...input });
    return json({ user }, { status: 201 });
  });
}
