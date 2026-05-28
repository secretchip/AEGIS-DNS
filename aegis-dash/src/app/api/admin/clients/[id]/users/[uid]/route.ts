import { handle, json } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { updateUserSchema } from "@/lib/validation";
import { deleteClientUser, updateClientUser } from "@/lib/user-service";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; uid: string }> },
) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { id, uid } = await params;
    const input = updateUserSchema.parse(await req.json());
    const user = await updateClientUser({
      clientId: Number(id),
      userId: Number(uid),
      actorUserId: admin.user.id,
      ...input,
    });
    return json({ user });
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; uid: string }> },
) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { id, uid } = await params;
    deleteClientUser({
      clientId: Number(id),
      userId: Number(uid),
      actorUserId: admin.user.id,
    });
    return json({ ok: true });
  });
}
