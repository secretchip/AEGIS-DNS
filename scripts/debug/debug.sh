TYPE="block" #change type to "block" or "allow" depending on which list you want to debug

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INPUT_DIR="$BASE_DIR/public_${TYPE}_lists/domains"

INPUT_FILES=("$INPUT_DIR"/hosts-"$TYPE"-part*.txt)

echo "1) Raw total lines:"
cat "${INPUT_FILES[@]}" | wc -l

echo "2) Non-empty lines:"
grep -hv '^[[:space:]]*$' "${INPUT_FILES[@]}" | wc -l

echo "3) After awk extraction, before dedup:"
grep -hv '^[[:space:]]*$' "${INPUT_FILES[@]}" | awk '
{
    line = $0

    if (match(line, /www[0-9]+\./)) {
        candidate = line
        sub(/www[0-9]+\./, "", candidate)
        if (candidate ~ /(\*\.)*([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/) {
            line = candidate
        }
    }

    if (match(line, /(\*\.)*([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/)) {
        print substr(line, RSTART, RLENGTH)
    }
}
' | wc -l

echo "4) After sort -u:"
grep -hv '^[[:space:]]*$' "${INPUT_FILES[@]}" | awk '
{
    line = $0

    if (match(line, /www[0-9]+\./)) {
        candidate = line
        sub(/www[0-9]+\./, "", candidate)
        if (candidate ~ /(\*\.)*([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/) {
            line = candidate
        }
    }

    if (match(line, /(\*\.)*([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/)) {
        print substr(line, RSTART, RLENGTH)
    }
}
' | sort -u | wc -l