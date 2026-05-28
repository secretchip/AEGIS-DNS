import { describe, expect, it } from "vitest";
import { computeClientStats } from "@/lib/stats";
import type { DnsStats } from "@/lib/technitium/types";

const base: DnsStats = {
  totalQueries: 1000,
  totalNoError: 800,
  totalBlocked: 200,
  totalServerFailure: 50,
  totalNxDomain: 100,
  totalRefused: 10,
  totalCached: 400,
  totalClients: 5,
};

describe("computeClientStats", () => {
  it("derives allowed = noError - blocked", () => {
    const view = computeClientStats(base);
    const allowed = view.buckets.find((b) => b.key === "allowed")!;
    expect(allowed.count).toBe(600);
    expect(allowed.percent).toBe(60);
  });

  it("maps blocked / server error / nxdomain / refused directly", () => {
    const view = computeClientStats(base);
    const get = (k: string) => view.buckets.find((b) => b.key === k)!.count;
    expect(get("blocked")).toBe(200);
    expect(get("server_error")).toBe(50);
    expect(get("nxdomain")).toBe(100);
    expect(get("refused")).toBe(10);
  });

  it("clamps allowed to zero when blocked exceeds noError", () => {
    const view = computeClientStats({ ...base, totalNoError: 100, totalBlocked: 300 });
    expect(view.buckets.find((b) => b.key === "allowed")!.count).toBe(0);
  });

  it("returns zero percentages when there are no queries", () => {
    const view = computeClientStats({ ...base, totalQueries: 0 });
    expect(view.totalQueries).toBe(0);
    expect(view.buckets.every((b) => b.percent === 0)).toBe(true);
  });
});
