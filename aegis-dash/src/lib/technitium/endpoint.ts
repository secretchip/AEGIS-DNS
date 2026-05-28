import type { ClientEndpoint } from "./types";

/**
 * Endpoint URLs are deterministic from the client slug used as a subdomain —
 * there is no token/secret in the URL.
 */
export function buildEndpoint(slug: string, endpointBase: string): ClientEndpoint {
  const host = `${slug}.${endpointBase}`;
  return {
    doh: `https://${host}/dns-query`,
    dot: `tls://${host}:853`,
    doq: `quic://${host}:853`,
  };
}
