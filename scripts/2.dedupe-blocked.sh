#!/usr/bin/env bash
set -euo pipefail

TYPE="block"

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INPUT_DIR_BASE="$BASE_DIR/public_${TYPE}_lists"
INPUT_DIR_MANUAL="$INPUT_DIR_BASE/input"
INPUT_DIR_DOMAINS="$INPUT_DIR_BASE/domains"
INPUT_DIR_IPS="$INPUT_DIR_BASE/ips"

MANUAL_ARCHIVE_DIR="$BASE_DIR/scripts/logs/archive"

TEMP_DIR="$BASE_DIR/scripts/temp/${TYPE}"
LOG_DIR="$BASE_DIR/scripts/logs"

OUTPUT_DIR_DOMAINS="$INPUT_DIR_DOMAINS"
OUTPUT_DIR_IPS="$INPUT_DIR_IPS"
OUTPUT_DIR_REJECTED="$INPUT_DIR_BASE/rejected"

DOMAINS_MERGED="$TEMP_DIR/all-unique-${TYPE}-domains.txt"
IPS_MERGED="$TEMP_DIR/all-unique-${TYPE}-ips.txt"
REJECTED_FILE="$TEMP_DIR/all-rejected-${TYPE}.txt"

DOMAIN_PREFIX="$TEMP_DIR/chunk-${TYPE}-domains-"
IP_PREFIX="$TEMP_DIR/chunk-${TYPE}-ips-"
REJECTED_PREFIX="$TEMP_DIR/chunk-${TYPE}-rejected-"

MAX_LINES=2000000

mkdir -p "$TEMP_DIR" "$LOG_DIR" "$OUTPUT_DIR_DOMAINS" "$OUTPUT_DIR_IPS" "$OUTPUT_DIR_REJECTED" "$MANUAL_ARCHIVE_DIR"

TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
LOG_FILE="$LOG_DIR/dedupe-${TYPE}-${TIMESTAMP}.log"

exec > >(tee -a "$LOG_FILE") 2>&1

echo "[*] =================================================="
echo "[*] Script started at: $(date '+%Y-%m-%d %H:%M:%S')"
echo "[*] Log file: $LOG_FILE"
echo "[*] TYPE: $TYPE"
echo "[*] BASE_DIR: $BASE_DIR"
echo "[*] INPUT_DIR_MANUAL: $INPUT_DIR_MANUAL"
echo "[*] INPUT_DIR_DOMAINS: $INPUT_DIR_DOMAINS"
echo "[*] INPUT_DIR_IPS: $INPUT_DIR_IPS"
echo "[*] OUTPUT_DIR_DOMAINS: $OUTPUT_DIR_DOMAINS"
echo "[*] OUTPUT_DIR_IPS: $OUTPUT_DIR_IPS"
echo "[*] OUTPUT_DIR_REJECTED: $OUTPUT_DIR_REJECTED"
echo "[*] TEMP_DIR: $TEMP_DIR"
echo "[*] =================================================="

echo "[*] Discovering input files..."

MANUAL_FILES=("$INPUT_DIR_MANUAL"/input-"$TYPE"*.txt)
DOMAIN_FILES=("$INPUT_DIR_DOMAINS"/hosts-"$TYPE"-part*.txt)
IP_FILES=("$INPUT_DIR_IPS"/ips-"$TYPE"-part*.txt)

INPUT_FILES=()

if [ -e "${MANUAL_FILES[0]}" ]; then
    INPUT_FILES+=("${MANUAL_FILES[@]}")
fi

if [ -e "${DOMAIN_FILES[0]}" ]; then
    INPUT_FILES+=("${DOMAIN_FILES[@]}")
fi

if [ -e "${IP_FILES[0]}" ]; then
    INPUT_FILES+=("${IP_FILES[@]}")
fi

MANUAL_COUNT=0
DOMAIN_COUNT=0
IP_COUNT=0

[ -e "${MANUAL_FILES[0]}" ] && MANUAL_COUNT="${#MANUAL_FILES[@]}"
[ -e "${DOMAIN_FILES[0]}" ] && DOMAIN_COUNT="${#DOMAIN_FILES[@]}"
[ -e "${IP_FILES[0]}" ] && IP_COUNT="${#IP_FILES[@]}"

echo "[*] Manual input files found:  $MANUAL_COUNT"
echo "[*] Domain input files found:  $DOMAIN_COUNT"
echo "[*] IP input files found:      $IP_COUNT"
echo "[*] Total input files found:   ${#INPUT_FILES[@]}"

if [ "${#INPUT_FILES[@]}" -eq 0 ]; then
    echo "[!] No input files found in:"
    echo "    - $INPUT_DIR_MANUAL"
    echo "    - $INPUT_DIR_DOMAINS"
    echo "    - $INPUT_DIR_IPS"
    exit 1
fi

echo "[*] Input file list:"
printf '    - %s\n' "${INPUT_FILES[@]}"

echo "[*] Cleaning previous temp/generated files..."
rm -f "$DOMAINS_MERGED" "$IPS_MERGED" "$REJECTED_FILE"
rm -f "${DOMAIN_PREFIX}"* "${IP_PREFIX}"* "${REJECTED_PREFIX}"*
touch "$DOMAINS_MERGED" "$IPS_MERGED" "$REJECTED_FILE"

echo "[*] Processing ${#INPUT_FILES[@]} input file(s)..."

grep -hv '^[[:space:]]*$' "${INPUT_FILES[@]}" \
| awk -v domains_out="$DOMAINS_MERGED" -v ips_out="$IPS_MERGED" -v rejected_out="$REJECTED_FILE" '
BEGIN {
    domain_re = "^(\\*\\.)*([A-Za-z0-9-]+\\.)+[A-Za-z]{2,}$"
    domain_extract_re = "(\\*\\.)*([A-Za-z0-9-]+\\.)+[A-Za-z]{2,}"
    ipv4_re = "^([0-9]{1,3}\\.){3}[0-9]{1,3}$"
    ipv4_port_re = "^([0-9]{1,3}\\.){3}[0-9]{1,3}:[0-9]+$"
}

function is_valid_ipv4(ip, parts, n, i) {
    n = split(ip, parts, ".")
    if (n != 4) return 0
    for (i = 1; i <= 4; i++) {
        if (parts[i] !~ /^[0-9]+$/) return 0
        if (parts[i] < 0 || parts[i] > 255) return 0
    }
    return 1
}

{
    original = $0
    line = $0
    matched = 0

    gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)

    if (line ~ /^www[0-9]+\./) {
        candidate = line
        sub(/^www[0-9]+\./, "", candidate)

        if (match(candidate, domain_extract_re)) {
            candidate_match = substr(candidate, RSTART, RLENGTH)
            if (candidate_match ~ domain_re) {
                line = candidate_match
            }
        }
    }

    if (line ~ ipv4_re && is_valid_ipv4(line)) {
        print line >> ips_out
        matched = 1
    }
    else if (line ~ ipv4_port_re) {
        ip_only = line
        sub(/:[0-9]+$/, "", ip_only)
        if (is_valid_ipv4(ip_only)) {
            print ip_only >> ips_out
            matched = 1
        }
    }
    else if (match(line, domain_extract_re)) {
        domain = substr(line, RSTART, RLENGTH)
        if (domain ~ domain_re) {
            print domain >> domains_out
            matched = 1
        }
    }

    if (!matched) {
        print original >> rejected_out
    }
}
'

echo "[*] Sorting and deduplicating outputs..."
sort -u "$DOMAINS_MERGED" -o "$DOMAINS_MERGED"
sort -u "$IPS_MERGED" -o "$IPS_MERGED"
sort -u "$REJECTED_FILE" -o "$REJECTED_FILE"

echo "[*] Post-processing counts:"
DOMAIN_LINE_COUNT="$(wc -l < "$DOMAINS_MERGED")"
IP_LINE_COUNT="$(wc -l < "$IPS_MERGED")"
REJECTED_LINE_COUNT="$(wc -l < "$REJECTED_FILE")"

echo "    Domains : $DOMAIN_LINE_COUNT"
echo "    IPs     : $IP_LINE_COUNT"
echo "    Rejected: $REJECTED_LINE_COUNT"

echo "[*] Cleaning previous output files..."
rm -f "$OUTPUT_DIR_DOMAINS"/hosts-"$TYPE"-part*.txt
rm -f "$OUTPUT_DIR_IPS"/ips-"$TYPE"-part*.txt
rm -f "$OUTPUT_DIR_REJECTED"/rejected-"$TYPE"-part*.txt

echo "[*] Splitting domain list into chunks of max $MAX_LINES lines..."
if [ -s "$DOMAINS_MERGED" ]; then
    split -l "$MAX_LINES" -d -a 3 "$DOMAINS_MERGED" "$DOMAIN_PREFIX"
fi

echo "[*] Renaming domain chunks dynamically..."
i=0
for file in "${DOMAIN_PREFIX}"*; do
    [ -e "$file" ] || continue
    mv "$file" "$OUTPUT_DIR_DOMAINS/hosts-${TYPE}-part${i}.txt"
    i=$((i + 1))
done
echo "[*] Generated $i domain file(s)."

echo "[*] Splitting IP list into chunks of max $MAX_LINES lines..."
if [ -s "$IPS_MERGED" ]; then
    split -l "$MAX_LINES" -d -a 3 "$IPS_MERGED" "$IP_PREFIX"
fi

echo "[*] Renaming IP chunks dynamically..."
j=0
for file in "${IP_PREFIX}"*; do
    [ -e "$file" ] || continue
    mv "$file" "$OUTPUT_DIR_IPS/ips-${TYPE}-part${j}.txt"
    j=$((j + 1))
done
echo "[*] Generated $j IP file(s)."

echo "[*] Splitting rejected list into chunks of max $MAX_LINES lines..."
if [ -s "$REJECTED_FILE" ]; then
    split -l "$MAX_LINES" -d -a 3 "$REJECTED_FILE" "$REJECTED_PREFIX"
fi

echo "[*] Renaming rejected chunks dynamically..."
k=0
for file in "${REJECTED_PREFIX}"*; do
    [ -e "$file" ] || continue
    mv "$file" "$OUTPUT_DIR_REJECTED/rejected-${TYPE}-part${k}.txt"
    k=$((k + 1))
done
echo "[*] Generated $k rejected file(s)."

echo "[*] Done."
echo "[*] Domain merged file:   $DOMAINS_MERGED"
echo "[*] IP merged file:       $IPS_MERGED"
echo "[*] Rejected lines file:  $REJECTED_FILE"

echo
echo "[*] Final domain output files:"
ls -lh "$OUTPUT_DIR_DOMAINS"/hosts-"$TYPE"-part*.txt 2>/dev/null || true

echo
echo "[*] Final IP output files:"
ls -lh "$OUTPUT_DIR_IPS"/ips-"$TYPE"-part*.txt 2>/dev/null || true

echo
echo "[*] Final rejected output files:"
ls -lh "$OUTPUT_DIR_REJECTED"/rejected-"$TYPE"-part*.txt 2>/dev/null || true

echo
echo "[*] Final line counts:"
wc -l "$DOMAINS_MERGED" "$IPS_MERGED" "$REJECTED_FILE" 2>/dev/null || true

echo "[*] Archiving manual input files..."

RUN_ARCHIVE_DIR=""

if [ "$MANUAL_COUNT" -gt 0 ]; then
    ARCHIVE_TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
    RUN_ARCHIVE_DIR="$MANUAL_ARCHIVE_DIR/$ARCHIVE_TIMESTAMP"
    mkdir -p "$RUN_ARCHIVE_DIR"

    echo "[*] Moving $MANUAL_COUNT manual input file(s) to $RUN_ARCHIVE_DIR"
    for f in "${MANUAL_FILES[@]}"; do
        [ -e "$f" ] || continue
        mv "$f" "$RUN_ARCHIVE_DIR/"
    done
else
    echo "[*] No manual input files to archive."
fi

echo "[*] Finalizing log location..."

if [ -n "$RUN_ARCHIVE_DIR" ]; then
    FINAL_LOG="$RUN_ARCHIVE_DIR/$(basename "$LOG_FILE")"
    echo "[*] Moving log to archive: $FINAL_LOG"
    mv "$LOG_FILE" "$FINAL_LOG"
else
    echo "[*] No archive directory created. Log remains in: $LOG_FILE"
fi

touch $INPUT_DIR_MANUAL/input-"$TYPE"-.txt

echo "[*] Script finished at: $(date '+%Y-%m-%d %H:%M:%S')"
echo "[*] =================================================="