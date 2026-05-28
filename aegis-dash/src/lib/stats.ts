/**
 * Maps raw Technitium per-client counters into the dashboard's display buckets.
 * Pure function — unit tested. Stats are always scoped to a single client.
 */
import type { DnsStats } from "./technitium/types";

export interface StatBucket {
  key: string;
  label: string;
  count: number;
  /** Percentage of total queries, 0–100, rounded to 1 decimal. */
  percent: number;
  color: string;
}

export interface ClientStatsView {
  totalQueries: number;
  buckets: StatBucket[];
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function computeClientStats(stats: DnsStats): ClientStatsView {
  const total = Math.max(0, stats.totalQueries);
  const blocked = Math.max(0, stats.totalBlocked);
  // "Allowed" = successful, non-blocked answers.
  const allowed = Math.max(0, stats.totalNoError - stats.totalBlocked);
  const serverError = Math.max(0, stats.totalServerFailure);
  const nxdomain = Math.max(0, stats.totalNxDomain);
  const refused = Math.max(0, stats.totalRefused);

  const buckets: StatBucket[] = [
    { key: "allowed", label: "Allowed", count: allowed, percent: pct(allowed, total), color: "#16a34a" },
    { key: "blocked", label: "Blocked", count: blocked, percent: pct(blocked, total), color: "#dc2626" },
    { key: "nxdomain", label: "NXDOMAIN", count: nxdomain, percent: pct(nxdomain, total), color: "#d97706" },
    { key: "server_error", label: "Server error", count: serverError, percent: pct(serverError, total), color: "#7c3aed" },
    { key: "refused", label: "Refused", count: refused, percent: pct(refused, total), color: "#64748b" },
  ];

  return { totalQueries: total, buckets };
}
