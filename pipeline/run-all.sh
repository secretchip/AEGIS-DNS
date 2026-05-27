#!/usr/bin/env bash
# Run the full AEGIS-DNS pipeline end to end. The execution order lives here
# (no longer encoded in numeric script-name prefixes). Each stage exits
# non-zero on failure; this script bails immediately under set -e.
#
# Env vars honored by the stages:
#   DOWNLOAD_CONCURRENCY     workers for stage 1 (default 12)
#   MAX_FAILURES             consecutive-failure threshold (default 5)
#   TECHNITIUM_API_TOKEN     admin token for Technitium API; if unset, the
#                            pin-sync stage skips and uses existing pin files
#   TECHNITIUM_HOST          default https://aegis.dns.secretchip.net:53444
#   TECHNITIUM_INSECURE_SSL  "true" to skip TLS verification (only if you
#                            know why you're doing it)
#   DROP_THRESHOLD_{BLOCK,ALLOW}  per-type drop % limits (defaults: see CLAUDE.md)
#   GROW_THRESHOLD_{BLOCK,ALLOW}  per-type grow % limits (default 500 each)
#   DROP_THRESHOLD / GROW_THRESHOLD  global fallbacks if per-type not set
#   RECONCILE_FORCE       bypass overwrite_original guard (default false)
#   VERIFY_FORCE          bypass verify-output thresholds (default false)
#   CATEGORY_MAX_LINES    per-category chunk line cap (default 2000000)
#   CATEGORY_MAX_BYTES    per-category chunk byte cap (default 52428800)
#   AEGIS_PROVIDER_*      per-provider category module controls; live lookup
#                         modules should use bounded queues + cache, not the
#                         full published block corpus
#   SKIP_RECONCILE        when "true", skip stage 3 reconcile.sh entirely.
#                         Use for debugging unexpected list removals. With
#                         reconcile off, cross-list overlap survives — block
#                         and allow may both contain the same domain. Most
#                         DNS filters resolve that as "allow wins", so the
#                         net effect is that those domains stop being blocked.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Auto-load local secrets if the file exists. This means `bash run-all.sh`
# works without manually sourcing the env file. Shell-set vars (e.g. from
# a cron line) take precedence — sourcing here only adds to the env, it
# doesn't overwrite. The file is gitignored under /var/.
SECRETS_FILE="$ROOT_DIR/var/secrets/aegis-dns.env"
if [[ -r "$SECRETS_FILE" ]]; then
  set +u   # don't fail on unset $TECHNITIUM_INSECURE_SSL etc. inside the env file
  # shellcheck source=/dev/null
  . "$SECRETS_FILE"
  set -u
fi

# Capture the run start time so finalize-build can compute total duration.
mkdir -p "$ROOT_DIR/var/state"
date -u +%Y-%m-%dT%H:%M:%S+00:00 > "$ROOT_DIR/var/state/build-start.iso"

bash "$SCRIPT_DIR/download-lists.sh" --type block
bash "$SCRIPT_DIR/download-lists.sh" --type allow

python3 "$SCRIPT_DIR/cleanup.py" --type block
python3 "$SCRIPT_DIR/cleanup.py" --type allow

# Pull pins from the Technitium DNS Server's internal allow/block engine
# (Settings → Blocking → Allowed Zones / Blocked Zones — NOT the Advanced
# Blocking App). Fail-soft: if the API is unreachable or
# TECHNITIUM_API_TOKEN is unset, existing sources/pins/*.txt are kept
# as-is and the pipeline continues.
python3 "$SCRIPT_DIR/sync-pins-from-technitium.py"

# Validate the pin files (whether just synced or carried over from a
# previous run) and emit them as a manual-input file for dedupe to merge.
python3 "$SCRIPT_DIR/extract-pins.py"

if [[ "${SKIP_RECONCILE:-false}" == "true" ]]; then
  echo "SKIP_RECONCILE=true: skipping stage 3 (reconcile)."
else
  bash "$SCRIPT_DIR/reconcile.sh"
fi

bash "$SCRIPT_DIR/dedupe.sh" --type block
bash "$SCRIPT_DIR/dedupe.sh" --type allow

bash "$SCRIPT_DIR/verify.sh"

# Compute final stats, prepend ASCII headers to each public chunk,
# and refresh the README stats block. Runs before manifest so the
# manifest's sha256 sums reflect the headered files.
python3 "$SCRIPT_DIR/finalize-build.py"

python3 "$SCRIPT_DIR/manifest.py"
python3 "$SCRIPT_DIR/consumer-config.py"
python3 "$SCRIPT_DIR/build-category-lists.py"

bash "$SCRIPT_DIR/changelog.sh"
