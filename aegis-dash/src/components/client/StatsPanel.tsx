"use client";

import { useState } from "react";
import { apiFetch } from "@/components/api-client";
import { StatsView } from "@/components/StatsView";
import { Card } from "@/components/ui";
import type { ClientStatsView } from "@/lib/stats";

const RANGES = [
  { key: "LastHour", label: "Hour" },
  { key: "LastDay", label: "Day" },
  { key: "LastWeek", label: "Week" },
  { key: "LastMonth", label: "Month" },
] as const;

export function StatsPanel({
  initial,
  initialRange,
}: {
  initial: ClientStatsView;
  initialRange: string;
}) {
  const [stats, setStats] = useState(initial);
  const [range, setRange] = useState(initialRange);
  const [loading, setLoading] = useState(false);

  async function select(next: string) {
    if (next === range) return;
    setRange(next);
    setLoading(true);
    try {
      const data = await apiFetch<{ stats: ClientStatsView }>(
        `/api/client/stats?range=${next}`,
      );
      setStats(data.stats);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card
      title="DNS statistics"
      description="Traffic seen on your endpoint only."
      actions={
        <div className="flex gap-1 rounded-md border border-slate-200 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => select(r.key)}
              className={
                "rounded px-2.5 py-1 text-xs font-medium " +
                (range === r.key
                  ? "bg-brand text-white"
                  : "text-slate-600 hover:bg-slate-100")
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      }
    >
      <div className={loading ? "opacity-50 transition-opacity" : undefined}>
        <StatsView stats={stats} />
      </div>
    </Card>
  );
}
