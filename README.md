# AEGIS-DNS

Daily list update

[![Last commit](https://img.shields.io/github/last-commit/secretchip/AEGIS-DNS)](https://github.com/secretchip/AEGIS-DNS/commits/main)
[![License: GPL v3](https://img.shields.io/badge/license-GPL%20v3-blue)](LICENSE)

[![Block domains](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsecretchip%2FAEGIS-DNS%2Frefs%2Fheads%2Fmain%2Fpublic_block_lists%2Fbadge-domains.json)](public_block_lists/manifest.json)
[![Block IPs](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsecretchip%2FAEGIS-DNS%2Frefs%2Fheads%2Fmain%2Fpublic_block_lists%2Fbadge-ips.json)](public_block_lists/manifest.json)
[![Allow domains](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsecretchip%2FAEGIS-DNS%2Frefs%2Fheads%2Fmain%2Fpublic_allow_lists%2Fbadge-domains.json)](public_allow_lists/manifest.json)
[![Allow IPs](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsecretchip%2FAEGIS-DNS%2Frefs%2Fheads%2Fmain%2Fpublic_allow_lists%2Fbadge-ips.json)](public_allow_lists/manifest.json)
[![Pins](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsecretchip%2FAEGIS-DNS%2Frefs%2Fheads%2Fmain%2Fpublic_block_lists%2Fbadge-pins.json)](sources/pins/)
[![Last build](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsecretchip%2FAEGIS-DNS%2Frefs%2Fheads%2Fmain%2Fpublic_block_lists%2Fbadge-build.json)](https://github.com/secretchip/AEGIS-DNS/actions/workflows/release.yml)

Curated DNS allowlist + blocklist pipeline. Aggregates many public source
lists, validates and deduplicates them, reconciles allow/block conflicts,
and publishes the result as flat text files for use by DNS filters.
The lists powers [`dns.secretchip.net`](https://dns.secretchip.net) and
are equally usable by AdGuard Home, Pi-hole, Unbound, dnsmasq, or any
other host-list-based filter.

## Stats

<!-- stats:start -->
_Last build: **2026-05-28 08:55 UTC**, took 44m 39s._

| List  | Domains                | IPs                    | Chunks (domains / IPs) |
| ----- | ---------------------: | ---------------------: | ---------------------: |
| block | 46,927,348 | 268,760 | 24 / 1 |
| allow | 20,446 | 21 | 1 / 1 |

Manually pinned: **0** block, **0** allow.
<!-- stats:end -->

(_The block above is regenerated automatically by `pipeline/finalize-build.py` at the end of every pipeline run._)

## Consume the lists

The fastest path is the **manifest** — it lists every part file, line
count, and SHA-256, so you don't have to hardcode chunk filenames that
change with the data.

| Type  | Manifest |
| ----- | -------- |
| Block | <https://raw.githubusercontent.com/secretchip/AEGIS-DNS/refs/heads/main/public_block_lists/manifest.json> |
| Allow | <https://raw.githubusercontent.com/secretchip/AEGIS-DNS/refs/heads/main/public_allow_lists/manifest.json> |
| Block categories | <https://raw.githubusercontent.com/secretchip/AEGIS-DNS/refs/heads/main/public_block_categories_lists/manifest.json> |

Manifest schema (v1):

```json
{
  "schema_version": 1,
  "generated_at": "2026-04-29T13:35:20Z",
  "type": "block",
  "total_lines": 46063517,
  "parts": [
    {
      "name": "hosts-block-part0.txt",
      "kind": "domains",
      "url": "https://raw.githubusercontent.com/.../hosts-block-part0.txt",
      "lines": 2000000,
      "sha256": "<hex>"
    }
  ]
}
```

Direct URLs are stable (`hosts-{type}-part{N}.txt` for domains,
`ips-{type}-part{N}.txt` for IPv4) but the chunk count changes — always
read the manifest first.

Block category lists are generated from the final published block corpus
and grouped by classifier modules. Category chunks live at
`public_block_categories_lists/{domains,ips}/{category}/`; a domain or IP
can appear in every category where a module classifies it.

Broad classification is provenance-first: cleanup preserves which source
URL contributed each entry, and `sources/block_source_categories.tsv` maps
source URLs/patterns to categories. Category aliases are normalized through
`sources/category_aliases.tsv`; conflicting positive categories are kept as
a union and logged under `var/logs/categories/<run>/conflicts.tsv`.

External lookup providers should be queue/cache driven, not pointed at the
full corpus. Runtime lookup state lives in
`var/state/classification-cache.sqlite3`; default TTLs are 90 days for hits,
30 days for misses, and 24 hours for transient errors.

### Classify specific indicators

To classify a small set of domains, URLs, or IPv4s with the available
provider modules without publishing category files:

```sh
python3 pipeline/build-category-lists.py \
  --classify https://malicious.example/path \
  --classify 1.2.3.4
```

The command prints TSV rows: `kind<TAB>entry<TAB>category`.

To queue indicators for bounded live-provider enrichment:

```sh
python3 pipeline/build-category-lists.py \
  --enqueue https://suspicious.example/path \
  --enqueue-provider urlhaus
```

Provider modules opt into this by setting `AEGIS_PROVIDER_INPUT_SCOPE=queue`
and `AEGIS_PROVIDER_CACHE_ENABLED=true` in their env template.

External queue providers are included for URLhaus, ThreatFox, AbuseIPDB,
GreyNoise, Google Web Risk, and VirusTotal. They are disabled by default;
copy the provider's `module.env.template` values into
`var/secrets/providers/<provider>.env`, set `AEGIS_PROVIDER_ENABLED=true`,
and add the required API key/token. Every external module is configured as
fail-soft, so provider outages, bad credentials, or rate limits warn in the
category logs instead of failing the full pipeline.

### Manual categories

Manual campaign categories live in `sources/manual-categories/`. Copy
`_template.txt` to a descriptive file name, then fill in:

```text
category: example-malware-campaign
source: https://example.com/research/report
entry: malicious.example.com
entry: https://landing.example.net/path
entry: 1.2.3.4
```

The manual category module preserves source rows in the input file as the
audit trail. Published category outputs include only entries that are also
present in `public_block_lists`.

### Bulk downloads via GitHub Releases

For consumers that want a single download instead of N parts, every list
update also publishes a [GitHub Release](https://github.com/secretchip/AEGIS-DNS/releases)
tagged `release-YYYYMMDD` with:

- `aegis-block-lists.tar.gz` — gzipped `public_block_lists/` (domains + ips + manifest)
- `aegis-allow-lists.tar.gz` — gzipped `public_allow_lists/`
- `aegis-block-category-lists.tar.gz` — gzipped `public_block_categories_lists/`, when category output exists
- `block-manifest.json`, `allow-manifest.json` — copies of the manifests
- `block-categories-manifest.json` — copy of the category manifest, when category output exists
- `sha256sums.txt` — sha256 of every release asset

The latest 30 releases are retained; older ones are pruned automatically.

## How it works

```
URL sources        validate +         allow/block        merge +
(per-line URLs) -> normalize    ->    reconcile     ->   chunk     -> manifest + config
                   (Python)          (Python+awk)        (sort -u)
```

## Build process

The full list build runs on the maintainer's private pipeline checkout.
This public repo publishes the generated chunks, manifests, release
assets, and submission validation workflow.

## Contributing

- **Report a false positive:** open an issue or PR.

## License

GPL-3.0 — see [LICENSE](LICENSE).
