#!/usr/bin/env bash
set -uo pipefail

TYPE="block"

SCRIPT_NAME="download-blocklists"
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

URL_LIST_GLOB="$BASE_DIR/public_resources/public_lists_${TYPE}*.txt"
OBSOLETE_URL_LIST_FILE="$BASE_DIR/public_resources/public_lists_${TYPE}_obsolete.txt"

OUTPUT_DIR="$BASE_DIR/public_${TYPE}_lists/input/public_lists"
LOG_DIR="$BASE_DIR/system-data/$SCRIPT_NAME"
TRASH_DIR="$BASE_DIR/scripts/temp/download"

TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"

SUCCESS_LOG="$LOG_DIR/download-$TYPE-success-$TIMESTAMP.log"
FAILED_LOG="$LOG_DIR/download-$TYPE-failed-$TIMESTAMP.log"
RUN_LOG="$LOG_DIR/download-$TYPE-run-$TIMESTAMP.log"
TRASH_FILE="$TRASH_DIR/trash.txt"
DUPLICATES_FILE="$TRASH_DIR/duplicates-$TYPE.txt"

mkdir -p "$OUTPUT_DIR" "$LOG_DIR" "$TRASH_DIR"
touch "$OBSOLETE_URL_LIST_FILE"

exec > >(tee -a "$RUN_LOG") 2>&1

echo "Cleaning previous input-$TYPE-automated files..."
find "$OUTPUT_DIR" -type f \( -name "input-$TYPE-automated-*.txt" -o -name "input-$TYPE-automated-*.meta" \) -print -delete

> "$TRASH_FILE"
> "$DUPLICATES_FILE"

declare -A seen_urls
declare -a temp_active_files=()

cleanup() {
  local f
  for f in "${temp_active_files[@]:-}"; do
    [[ -n "$f" && -f "$f" ]] && rm -f "$f"
  done
}
trap cleanup EXIT

echo "Starting blocklist download run"
echo "URL source glob     : $URL_LIST_GLOB"
echo "Obsolete URL file   : $OBSOLETE_URL_LIST_FILE"
echo "Output dir          : $OUTPUT_DIR"
echo "Trash file          : $TRASH_FILE"
echo "Duplicates file     : $DUPLICATES_FILE"
echo "Success log         : $SUCCESS_LOG"
echo "Failed log          : $FAILED_LOG"
echo

success_count=0
failed_count=0
trash_count=0
duplicate_count=0
obsolete_added_count=0
source_file_count=0
counter=1
matched_any_file=0

for URL_LIST_FILE in $URL_LIST_GLOB; do
  [[ -f "$URL_LIST_FILE" ]] || continue

  matched_any_file=1
  ((source_file_count++))

  TEMP_ACTIVE_FILE="$(mktemp)"
  temp_active_files+=("$TEMP_ACTIVE_FILE")

  echo "Processing source file: $URL_LIST_FILE"

  while IFS= read -r line || [[ -n "$line" ]]; do
    original_line="$line"
    url="$(printf '%s' "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

    if [[ -z "$url" || "$url" =~ ^# ]]; then
      echo "$original_line" >> "$TRASH_FILE"
      ((trash_count++))
      continue
    fi

    if [[ -n "${seen_urls[$url]:-}" ]]; then
      echo "$url" >> "$DUPLICATES_FILE"
      echo "Duplicate URL skipped: $url"
      ((duplicate_count++))
      continue
    fi
    seen_urls["$url"]=1

    output_file="$OUTPUT_DIR/input-$TYPE-automated-${counter}.txt"
    metadata_file="$OUTPUT_DIR/input-$TYPE-automated-${counter}.meta"

    echo "[$counter] Downloading: $url"

    if curl -fL --connect-timeout 20 --max-time 300 --retry 2 --retry-delay 2 -A "cb/0.1" "$url" -o "$output_file"; then
      {
        echo "source_url=$url"
        echo "source_list_file=$(basename "$URL_LIST_FILE")"
        echo "downloaded_at=$(date '+%Y-%m-%d %H:%M:%S %z')"
        echo "output_file=$(basename "$output_file")"
        echo "status=success"
      } > "$metadata_file"

      echo "$(date '+%Y-%m-%d %H:%M:%S') | SUCCESS | $(basename "$URL_LIST_FILE") | $url | $(basename "$output_file")" >> "$SUCCESS_LOG"
      echo "$url" >> "$TEMP_ACTIVE_FILE"
      echo "[$counter] OK"
      ((success_count++))
    else
      rm -f "$output_file"

      {
        echo "source_url=$url"
        echo "source_list_file=$(basename "$URL_LIST_FILE")"
        echo "downloaded_at=$(date '+%Y-%m-%d %H:%M:%S %z')"
        echo "output_file=$(basename "$output_file")"
        echo "status=failed"
      } > "$metadata_file"

      echo "$(date '+%Y-%m-%d %H:%M:%S') | FAILED | $(basename "$URL_LIST_FILE") | $url | $(basename "$output_file")" >> "$FAILED_LOG"
      echo "[$counter] FAILED"
      ((failed_count++))

      if ! grep -Fqx "$url" "$OBSOLETE_URL_LIST_FILE"; then
        echo "$url" >> "$OBSOLETE_URL_LIST_FILE"
        ((obsolete_added_count++))
        echo "[$counter] Added to obsolete URL list"
      else
        echo "[$counter] Already present in obsolete URL list"
      fi
    fi

    ((counter++))
  done < "$URL_LIST_FILE"

  mv "$TEMP_ACTIVE_FILE" "$URL_LIST_FILE"

  for i in "${!temp_active_files[@]}"; do
    if [[ "${temp_active_files[$i]}" == "$TEMP_ACTIVE_FILE" ]]; then
      unset 'temp_active_files[i]'
      break
    fi
  done

  echo "Finished source file: $URL_LIST_FILE"
  echo
done

if [[ "$matched_any_file" -eq 0 ]]; then
  echo "ERROR: No input files matched: $URL_LIST_GLOB"
  exit 1
fi

echo
echo "Run completed"
echo "Source files processed   : $source_file_count"
echo "Successful downloads     : $success_count"
echo "Failed downloads         : $failed_count"
echo "Trash lines stored       : $trash_count"
echo "Duplicate URLs skipped   : $duplicate_count"
echo "New obsolete URLs added  : $obsolete_added_count"
echo "Active URLs kept         : $success_count"