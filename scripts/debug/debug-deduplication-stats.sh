#!/usr/bin/env bash
set -euo pipefail

TYPE="block"

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INPUT_DIR="$BASE_DIR/public_${TYPE}_lists/domains"
INPUT_FILES=("$INPUT_DIR"/hosts-"$TYPE"-part*.txt)

grep -hv '^[[:space:]]*$' "${INPUT_FILES[@]}" \
| awk '
{
    line = $0

    # Remove leading www<digits>. if what remains is still a valid domain or wildcard domain
    if (line ~ /^www[0-9]+\./) {
        candidate = line
        sub(/^www[0-9]+\./, "", candidate)
        if (candidate ~ /^(\*\.)*([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/) {
            line = candidate
        }
    }

    # Extract first valid domain or wildcard domain found anywhere on line
    if (match(line, /(\*\.)*([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/)) {
        print substr(line, RSTART, RLENGTH)
    }
}
' \
| sort \
| uniq -c \
| sort -nr \
| head -100