TYPE="block"
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INPUT_DIR="$BASE_DIR/public_${TYPE}_lists/domains"
INPUT_FILES=("$INPUT_DIR"/hosts-"$TYPE"-part*.txt)

grep -hv '^[[:space:]]*$' "${INPUT_FILES[@]}" | awk '
{
    original = $0
    line = $0

    if (match(line, /www[0-9]+\./)) {
        candidate = line
        sub(/www[0-9]+\./, "", candidate)
        if (candidate ~ /(\*\.)*([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/) {
            line = candidate
        }
    }

    if (!match(line, /(\*\.)*([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/)) {
        print original
    }
}
'