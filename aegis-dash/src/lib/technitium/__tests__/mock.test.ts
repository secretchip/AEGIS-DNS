import { describe, expect, it } from "vitest";
import { MockTechnitium } from "@/lib/technitium/mock";
import { buildEndpoint } from "@/lib/technitium/endpoint";

const tech = new MockTechnitium();

describe("MockTechnitium", () => {
  it("builds deterministic, token-free subdomain endpoint URLs", () => {
    const ep = buildEndpoint("acme", "dns.secretchip.net");
    expect(ep.doh).toBe("https://acme.dns.secretchip.net/dns-query");
    expect(ep.dot).toBe("tls://acme.dns.secretchip.net:853");
    expect(ep.doq).toBe("quic://acme.dns.secretchip.net:853");
    // The endpoint is fully derived from the slug — no opaque token segment.
    expect(ep.doh).toBe(`https://acme.dns.secretchip.net/dns-query`);
  });

  it("returns deterministic stats per slug+range", async () => {
    const a1 = await tech.getClientStats(1, "acme", "LastDay");
    const a2 = await tech.getClientStats(1, "acme", "LastDay");
    expect(a1).toEqual(a2);
  });

  it("produces different stats for different clients", async () => {
    const acme = await tech.getClientStats(1, "acme", "LastDay");
    const globex = await tech.getClientStats(2, "globex", "LastDay");
    expect(acme.totalQueries).not.toBe(globex.totalQueries);
  });

  it("keeps counters internally consistent", async () => {
    const s = await tech.getClientStats(1, "acme", "LastWeek");
    expect(s.totalQueries).toBeGreaterThan(0);
    expect(s.totalBlocked).toBeLessThanOrEqual(s.totalQueries);
    expect(s.totalNoError).toBeLessThanOrEqual(s.totalQueries);
  });
});
