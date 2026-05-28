/**
 * Catalog of selectable policies / blocklists. Keys mirror the AEGIS-DNS
 * published lists: the base block/allow corpus plus the category lists
 * (see ../../README of the parent pipeline repo).
 */
export interface PolicyDef {
  key: string;
  label: string;
  description: string;
  group: "base" | "category";
}

export const POLICY_CATALOG: PolicyDef[] = [
  { key: "block", label: "Base blocklist", description: "Full AEGIS-DNS aggregated blocklist (domains + IPs).", group: "base" },
  { key: "allow", label: "Base allowlist", description: "AEGIS-DNS curated allowlist (reconciled exceptions).", group: "base" },
  { key: "ads", label: "Ads", description: "Advertising and ad-serving domains.", group: "category" },
  { key: "malware", label: "Malware", description: "Known malware distribution and infection domains.", group: "category" },
  { key: "phishing", label: "Phishing", description: "Credential-phishing and fraud domains.", group: "category" },
  { key: "c2", label: "C2", description: "Command-and-control infrastructure.", group: "category" },
  { key: "crypto", label: "Crypto mining", description: "Cryptojacking and miner pools.", group: "category" },
  { key: "gambling", label: "Gambling", description: "Online gambling and betting.", group: "category" },
  { key: "spam", label: "Spam", description: "Spam and unsolicited-mail sources.", group: "category" },
  { key: "tracking", label: "Tracking", description: "Trackers and telemetry endpoints.", group: "category" },
];

export const POLICY_KEYS = POLICY_CATALOG.map((p) => p.key);

export function isPolicyKey(key: string): boolean {
  return POLICY_KEYS.includes(key);
}
