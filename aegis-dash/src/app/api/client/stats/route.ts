import { handle, json } from "@/lib/api";
import { requireClientUser } from "@/lib/session";
import { computeClientStats } from "@/lib/stats";
import { getTechnitium, STATS_RANGES, type StatsRange } from "@/lib/technitium";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return handle(async () => {
    const { client } = await requireClientUser();
    const rangeParam = new URL(req.url).searchParams.get("range") as StatsRange | null;
    const range: StatsRange =
      rangeParam && STATS_RANGES.includes(rangeParam) ? rangeParam : "LastDay";

    const raw = await getTechnitium().getClientStats(client.id, client.slug, range);
    return json({ range, stats: computeClientStats(raw) });
  });
}
