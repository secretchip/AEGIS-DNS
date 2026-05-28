import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildEndpoint } from "./endpoint";
import type {
  ClientConfigInput,
  DnsStats,
  StatsRange,
  TechnitiumService,
} from "./types";

const CONFIG_DIR = join(process.cwd(), "data", "technitium-config");

/** Stable 32-bit hash so each slug yields its own deterministic numbers. */
function seedFrom(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RANGE_MULTIPLIER: Record<StatsRange, number> = {
  LastHour: 1,
  LastDay: 22,
  LastWeek: 150,
  LastMonth: 640,
};

function makeStats(seedKey: string, range: StatsRange): DnsStats {
  const rng = mulberry32(seedFrom(`${seedKey}:${range}`));
  const mult = RANGE_MULTIPLIER[range];
  const total = Math.floor((400 + rng() * 5600) * mult);
  const blocked = Math.floor(total * (0.08 + rng() * 0.22));
  const serverFailure = Math.floor(total * (rng() * 0.03));
  const nxdomain = Math.floor(total * (0.01 + rng() * 0.05));
  const refused = Math.floor(total * (rng() * 0.01));
  const noError = Math.max(0, total - serverFailure - nxdomain - refused);
  const cached = Math.floor(noError * (0.4 + rng() * 0.4));
  const clients = 1 + Math.floor(rng() * 40);
  return {
    totalQueries: total,
    totalNoError: noError,
    totalBlocked: blocked,
    totalServerFailure: serverFailure,
    totalNxDomain: nxdomain,
    totalRefused: refused,
    totalCached: cached,
    totalClients: clients,
  };
}

export class MockTechnitium implements TechnitiumService {
  async getStats(range: StatsRange): Promise<DnsStats> {
    return makeStats("__server__", range);
  }

  async getClientStats(
    _clientId: number,
    slug: string,
    range: StatsRange,
  ): Promise<DnsStats> {
    return makeStats(slug, range);
  }

  buildEndpoint(slug: string, endpointBase: string) {
    return buildEndpoint(slug, endpointBase);
  }

  async applyClientConfig(input: ClientConfigInput): Promise<void> {
    await mkdir(CONFIG_DIR, { recursive: true });
    const endpoint = buildEndpoint(input.slug, input.endpointBase);
    const doc = {
      // Shape mirrors a Technitium Advanced Blocking group keyed by subdomain.
      group: input.slug,
      subdomain: `${input.slug}.${input.endpointBase}`,
      endpoint,
      enabledPolicies: input.policies,
      allowed: input.rules.allow,
      blocked: input.rules.deny,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(
      join(CONFIG_DIR, `${input.slug}.json`),
      JSON.stringify(doc, null, 2) + "\n",
      "utf8",
    );
  }

  async removeClientConfig(slug: string): Promise<void> {
    await rm(join(CONFIG_DIR, `${slug}.json`), { force: true });
  }
}
