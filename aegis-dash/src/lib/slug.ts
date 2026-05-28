/** Normalize an arbitrary name into a DNS-label-safe slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 63);
}

const DOMAIN_RE =
  /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

/** Accept FQDNs and leading-wildcard domains (e.g. *.example.com). */
export function isValidDomain(domain: string): boolean {
  return DOMAIN_RE.test(domain.trim());
}
