import { assertActiveClient, assertCan, handle, json } from "@/lib/api";
import { requireClientUser } from "@/lib/session";
import { updateUserSchema } from "@/lib/validation";
import { deleteClientUser, updateClientUser } from "@/lib/user-service";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { user, client } = await requireClientUser();
    assertActiveClient(client);
    assertCan({ user, client }, "manage_users");
    const input = updateUserSchema.parse(await req.json());
    const updated = await updateClientUser({
      clientId: client.id,
      userId: Number((await params).id),
      actorUserId: user.id,
      ...input,
    });
    return json({ user: updated });
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { user, client } = await requireClientUser();
    assertActiveClient(client);
    assertCan({ user, client }, "manage_users");
    deleteClientUser({
      clientId: client.id,
      userId: Number((await params).id),
      actorUserId: user.id,
    });
    return json({ ok: true });
  });
}
