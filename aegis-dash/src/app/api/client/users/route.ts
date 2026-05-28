import { assertActiveClient, assertCan, handle, json } from "@/lib/api";
import { requireClientUser } from "@/lib/session";
import { createUserSchema } from "@/lib/validation";
import { createClientUser, listClientUsers } from "@/lib/user-service";

export const runtime = "nodejs";

export async function GET() {
  return handle(async () => {
    const { user, client } = await requireClientUser();
    assertCan({ user, client }, "manage_users");
    return json({ users: listClientUsers(client.id) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { user, client } = await requireClientUser();
    assertActiveClient(client);
    assertCan({ user, client }, "manage_users");
    const input = createUserSchema.parse(await req.json());
    const created = await createClientUser({ clientId: client.id, ...input });
    return json({ user: created }, { status: 201 });
  });
}
