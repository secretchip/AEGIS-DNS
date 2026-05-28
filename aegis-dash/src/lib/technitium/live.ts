import { buildEndpoint } from "./endpoint";
import type {
  ClientConfigInput,
  DnsStats,
  StatsRange,
  TechnitiumService,
} from "./types";

class NotImplemented extends Error {
  constructor(what: string) {
    super(
      `Technitium live ${what} is not wired yet. Set TECHNITIUM_MODE=mock for ` +
        `local development, or implement this against your server.`,
    );
    this.name = "NotImplemented";
  }
}

/**
 * Live implementation skeleton. Reuses the documented request shape from the
 * existing pipeline: form-encoded POST to /api/dashboard/stats/get with
 * token/type/utc, unwrapping response.stats.
 *
 * Only getStats is wired; per-client scoping and config writes are marked as
 * TODO so the integration points are explicit.
 */
export class LiveTechnitium implements TechnitiumService {
  private host: string;
  private token: string;
  private insecure: boolean;

  constructor() {
    this.host = process.env.TECHNITIUM_HOST ?? "";
    this.token = process.env.TECHNITIUM_API_TOKEN ?? "";
    this.insecure = process.env.TECHNITIUM_INSECURE_SSL === "true";
  }

  private async fetchStats(range: StatsRange): Promise<DnsStats> {
    if (!this.host || !this.token) {
      throw new Error(
        "TECHNITIUM_HOST and TECHNITIUM_API_TOKEN are required in live mode.",
      );
    }
    if (this.insecure) {
      // Dev-only: disable TLS verification for self-signed Technitium certs.
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    const body = new URLSearchParams({
      token: this.token,
      type: range,
      utc: "true",
    });
    const res = await fetch(`${this.host}/api/dashboard/stats/get`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json()) as {
      status?: string;
      errorMessage?: string;
      response?: { stats?: Partial<DnsStats> };
    };
    if (json.status !== "ok") {
      throw new Error(`Technitium returned status ${json.errorMessage ?? json.status}`);
    }
    const s = json.response?.stats ?? {};
    return {
      totalQueries: s.totalQueries ?? 0,
      totalNoError: s.totalNoError ?? 0,
      totalBlocked: s.totalBlocked ?? 0,
      totalServerFailure: s.totalServerFailure ?? 0,
      totalNxDomain: s.totalNxDomain ?? 0,
      totalRefused: s.totalRefused ?? 0,
      totalCached: s.totalCached ?? 0,
      totalClients: s.totalClients ?? 0,
    };
  }

  async getStats(range: StatsRange): Promise<DnsStats> {
    return this.fetchStats(range);
  }

  async getClientStats(): Promise<DnsStats> {
    // TODO: scope stats to the client's subdomain / Advanced Blocking group /
    // source network. The dashboard must never aggregate across clients.
    throw new NotImplemented("getClientStats");
  }

  buildEndpoint(slug: string, endpointBase: string) {
    return buildEndpoint(slug, endpointBase);
  }

  async applyClientConfig(_input: ClientConfigInput): Promise<void> {
    // TODO: write the subdomain-keyed group into the Technitium config file
    // and reload (e.g. Advanced Blocking app config + /api/apps/config/set).
    throw new NotImplemented("applyClientConfig");
  }

  async removeClientConfig(_slug: string): Promise<void> {
    // TODO: remove the subdomain-keyed group from the Technitium config.
    throw new NotImplemented("removeClientConfig");
  }
}
