import { LiveTechnitium } from "./live";
import { MockTechnitium } from "./mock";
import type { TechnitiumService } from "./types";

let instance: TechnitiumService | null = null;

export function getTechnitium(): TechnitiumService {
  if (!instance) {
    instance =
      process.env.TECHNITIUM_MODE === "live"
        ? new LiveTechnitium()
        : new MockTechnitium();
  }
  return instance;
}

export type { TechnitiumService } from "./types";
export * from "./types";
