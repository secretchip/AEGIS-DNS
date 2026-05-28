import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { Badge } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (current.user.platformRole === "admin") redirect("/admin");
  if (!current.client) redirect("/login");

  const { user, client } = current;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-slate-900">AEGIS-DNS</span>
            <span className="text-slate-300">/</span>
            <span className="font-medium text-slate-700">{client.name}</span>
            {client.status === "disabled" && <Badge tone="red">Suspended</Badge>}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              {user.email} · <span className="capitalize">{user.clientRole}</span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
