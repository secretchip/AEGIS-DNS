import type { ClientStatsView } from "@/lib/stats";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function StatsView({ stats }: { stats: ClientStatsView }) {
  const { totalQueries, buckets } = stats;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total queries</div>
          <div className="mt-1 text-xl font-semibold text-slate-900">{fmt(totalQueries)}</div>
        </div>
        {buckets.map((b) => (
          <div key={b.key} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
              {b.label}
            </div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{fmt(b.count)}</div>
            <div className="text-xs text-slate-400">{b.percent}%</div>
          </div>
        ))}
      </div>

      {/* Stacked breakdown bar */}
      <div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
          {buckets.map((b) => (
            <div
              key={b.key}
              style={{ width: `${b.percent}%`, background: b.color }}
              title={`${b.label}: ${b.percent}%`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
