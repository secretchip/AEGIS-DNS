import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  redirect(current.user.platformRole === "admin" ? "/admin" : "/dashboard");
}
