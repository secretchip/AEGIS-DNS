# AEGIS-DNS Dashboard (`aegis-dash`)

Multi-tenant dashboard for [AEGIS-DNS](https://github.com/secretchip/AEGIS-DNS)
over a Technitium DNS server. It provides:

- **Admin area** — list/create client accounts, configure each client's
  authentication (local / OIDC / SAML), disable & reactivate clients, and
  manage any client's users. Every admin action is available as a REST endpoint.
- **Client area** — per-tenant view with DNS statistics (scoped to that
  client's endpoint), a unique DoH/DoT/DoQ endpoint (per-client **subdomain**,
  no URL token), policy/blocklist selection, allow/deny rules, team management,
  and logout.

This is the **foundation build**: the full UI, auth, multi-tenant data model,
and a **mocked Technitium service layer**. Live Technitium API wiring and real
IdP integration are stubbed behind stable interfaces (see
`src/lib/technitium/live.ts` and `src/lib/auth/oidc.ts`).

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS · Drizzle ORM +
better-sqlite3 · iron-session · Vitest.

## Quick start

```sh
cp .env.example .env          # then set SESSION_SECRET + CONFIG_ENCRYPTION_KEY
npm install
npm run db:generate           # generate SQL migrations from the schema
npm run db:migrate            # apply them to ./data/aegis-dash.sqlite
npm run seed                  # demo admin + Acme (local) + Globex (OIDC mock)
npm run dev                   # http://localhost:3000
```

### Seeded logins (dev)

| Who              | Email                  | Auth            |
| ---------------- | ---------------------- | --------------- |
| Platform admin   | `admin@secretchip.net` | password        |
| Acme · owner     | `owner@acme.test`      | password        |
| Acme · manager   | `manager@acme.test`    | password        |
| Acme · viewer    | `viewer@acme.test`     | password        |
| Globex           | —                      | OIDC (mock SSO) |

Default password for seeded accounts: `Password123!` (override with
`SEED_PASSWORD`). For Globex, use **Sign in with SSO** on the login page — in
`AUTH_MODE=mock` the IdP round-trip is simulated and a viewer user is
JIT-provisioned.

## Configuration

See `.env.example`. Key switches:

- `TECHNITIUM_MODE=mock|live` — `mock` (default) needs no server and writes the
  per-client config that *would* be sent to Technitium into
  `data/technitium-config/<slug>.json`.
- `AUTH_MODE=mock|live` — `mock` enables the offline SSO round-trip.

## How it maps to Technitium

- **Endpoint**: each client's `slug` is a subdomain of `ENDPOINT_BASE`, e.g.
  `https://<slug>.dns.secretchip.net/dns-query` (DoH), `tls://…:853` (DoT),
  `quic://…:853` (DoQ). No token/secret in the URL.
- **Policies + rules** are written to a subdomain-keyed config
  (`applyClientConfig`); **disabling** a client removes that entry
  (`removeClientConfig`) while retaining all dashboard records, and
  **reactivating** re-adds it.
- **Stats** are always scoped to a single client's endpoint.

## Tests

```sh
npm run test        # stats mapping, permission matrix, JIT role mapping, mock
npm run lint
npm run build
```
