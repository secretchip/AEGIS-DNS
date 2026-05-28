export type StatsRange = "LastHour" | "LastDay" | "LastWeek" | "LastMonth";

export const STATS_RANGES: StatsRange[] = [
  "LastHour",
  "LastDay",
  "LastWeek",
  "LastMonth",
];

/**
 * Raw counters as returned by Technitium's /api/dashboard/stats/get
 * (response.stats). Mirrors the shape used by the existing pipeline
 * (pipeline/tests/python/test_fetch_technitium_stats.py).
 */
export interface DnsStats {
  totalQueries: number;
  totalNoError: number;
  totalBlocked: number;
  totalServerFailure: number;
  totalNxDomain: number;
  totalRefused: number;
  totalCached: number;
  totalClients: number;
}

export interface ClientEndpoint {
  doh: string;
  dot: string;
  doq: string;
}

export interface ClientConfigInput {
  slug: string;
  endpointBase: string;
  policies: string[];
  rules: { allow: string[]; deny: string[] };
}

/**
 * Stable interface the rest of the app depends on, regardless of whether the
 * mock or live implementation is active.
 */
export interface TechnitiumService {
  /** Server-wide stats (admin overview only). */
  getStats(range: StatsRange): Promise<DnsStats>;
  /** Stats scoped to a single client's endpoint. */
  getClientStats(clientId: number, slug: string, range: StatsRange): Promise<DnsStats>;
  /** Deterministic endpoint URLs derived from the client's slug + base. */
  buildEndpoint(slug: string, endpointBase: string): ClientEndpoint;
  /** Write/update the client's subdomain-keyed config on the server. */
  applyClientConfig(input: ClientConfigInput): Promise<void>;
  /** Remove the client's slug entry from the server config (on disable). */
  removeClientConfig(slug: string): Promise<void>;
}
