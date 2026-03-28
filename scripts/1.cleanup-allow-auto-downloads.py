#!/usr/bin/env python3
import ipaddress
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Iterable, Iterator, Set

TYPE = "allow"

# Strict extraction for valid IPv4s and DNS blocklist hostname patterns.
# Supports:
# - standard FQDNs like app.example.com
# - wildcard DNS blocklist patterns like *.example.com or *.*.*.*.example.com
VALID_CANDIDATE_RE = re.compile(
    r"(?i)(?<![a-z0-9-])"
    r"((?:(?:\*|[a-z0-9][a-z0-9-]{0,62})\.)+(?:[a-z0-9][a-z0-9-]{0,62})"
    r"|(?:\d{1,3}\.){3}\d{1,3})"
    r"(?![a-z0-9-])"
)

# Broad extraction for hostname-like garbage review, including invalid wildcards.
REJECT_CANDIDATE_RE = re.compile(
    r"(?i)(?<![a-z0-9-])"
    r"([a-z0-9*_][a-z0-9*_.-]{0,252}\.[a-z0-9*_.-]{1,252})"
    r"(?![a-z0-9-])"
)

URL_RE = re.compile(r'(?i)\bhttps?://[^\s<>"\'()]+')

# Match:
# - input-allow.txt
# - input-allow-1.txt
# - input-allow-foo.txt
# - input-allow_anything.txt
INPUT_FILE_RE = re.compile(rf"^input-{TYPE}.*\.txt$", re.IGNORECASE)


def is_valid_ipv4(value: str) -> bool:
    try:
        ipaddress.IPv4Address(value)
        return True
    except ValueError:
        return False


def is_valid_dns_block_entry(value: str) -> bool:
    value = value.rstrip(".").lower()

    if len(value) > 253 or "." not in value:
        return False

    labels = value.split(".")
    if any(not label for label in labels):
        return False

    # Final label cannot be numeric-only for domain-style entries
    if labels[-1].isdigit():
        return False

    label_re = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", re.IGNORECASE)

    # Allow "*" as a whole label only, since that is useful in DNS blocking.
    # Reject malformed wildcard labels like a*, *a, ab*cd, etc.
    for label in labels:
        if len(label) > 63:
            return False
        if "_" in label:
            return False
        if label == "*":
            continue
        if "*" in label:
            return False
        if not label_re.match(label):
            return False

    return True


def iter_text_from_file(path: Path) -> Iterator[str]:
    with path.open("r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            yield line


def discover_inputs(input_dir: Path) -> Iterable[Path]:
    for path in sorted(input_dir.glob(f"input-{TYPE}*.txt")):
        if path.is_file() and INPUT_FILE_RE.match(path.name):
            yield path


def normalize_url(url: str) -> str:
    return url.rstrip(".,;:!?)]").strip()


def process_line(
    line: str,
    valid_entries: Set[str],
    valid_ips: Set[str],
    rejected_tokens: Set[str],
    discovered_urls: Set[str],
) -> None:
    accepted_this_line: Set[str] = set()

    for match in VALID_CANDIDATE_RE.finditer(line):
        token = match.group(1).lower().rstrip(".")
        if is_valid_ipv4(token):
            valid_ips.add(token)
            valid_entries.add(token)
            accepted_this_line.add(token)
        elif is_valid_dns_block_entry(token):
            valid_entries.add(token)
            accepted_this_line.add(token)

    for match in REJECT_CANDIDATE_RE.finditer(line):
        token = match.group(1).lower().rstrip(".")

        if token in accepted_this_line:
            continue

        if is_valid_ipv4(token) or is_valid_dns_block_entry(token):
            continue

        rejected_tokens.add(token)

    for match in URL_RE.finditer(line):
        url = normalize_url(match.group(0))
        if url:
            discovered_urls.add(url)


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_sorted_lines(path: Path, values) -> None:
    sorted_values = sorted(set(values))
    content = "\n".join(sorted_values)
    if content:
        content += "\n"
    path.write_text(content, encoding="utf-8")


def main() -> int:
    script_path = Path(__file__).resolve()
    shield_root = script_path.parent.parent

    input_dir = shield_root / f"public_{TYPE}_lists" / "input" / "public_lists"
    output_file = shield_root / f"public_{TYPE}_lists" / "input" / f"input-{TYPE}-auto-clean.txt"
    trash_dir = shield_root / "scripts" / "temp" / f"clean-{TYPE}"
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    log_dir = shield_root / "scripts" / "logs" / "archive" / f"clean-{TYPE}" / timestamp

    if not input_dir.exists():
        raise FileNotFoundError(f"Input directory does not exist: {input_dir}")
    ensure_directory(output_file.parent)
    ensure_directory(trash_dir)
    ensure_directory(log_dir)

    inputs = list(discover_inputs(input_dir))
    if not inputs:
        debug_lines = [
            f"No input files found in: {input_dir}",
            f"Script path: {script_path}",
            f"SHIELD root: {shield_root}",
            f"Input directory exists: {input_dir.exists()}",
            "Directory contents:",
        ]

        if input_dir.exists():
            dir_contents = sorted(p.name for p in input_dir.iterdir())
            if dir_contents:
                debug_lines.extend(dir_contents)
            else:
                debug_lines.append("(empty)")
        else:
            debug_lines.append("(directory does not exist)")

        debug_lines.append("")
        debug_lines.append(f"Glob pattern used: input-{TYPE}*.txt")
        if input_dir.exists():
            glob_matches = sorted(p.name for p in input_dir.glob(f"input-{TYPE}*.txt"))
            debug_lines.append("Glob matches:")
            debug_lines.extend(glob_matches if glob_matches else ["(none)"])

        (log_dir / "run.log").write_text("\n".join(debug_lines) + "\n", encoding="utf-8")
        print(f"No input files found in: {input_dir}", file=sys.stderr)
        return 1

    aggregate_valid_entries: Set[str] = set()
    aggregate_ips: Set[str] = set()
    aggregate_rejected: Set[str] = set()
    aggregate_urls: Set[str] = set()

    per_file_counts = []
    deleted_files = []
    delete_failures = []

    for path in inputs:
        file_valid_entries: Set[str] = set()
        file_ips: Set[str] = set()
        file_rejected: Set[str] = set()
        file_urls: Set[str] = set()

        for line in iter_text_from_file(path):
            process_line(line, file_valid_entries, file_ips, file_rejected, file_urls)

        aggregate_valid_entries.update(file_valid_entries)
        aggregate_ips.update(file_ips)
        aggregate_rejected.update(file_rejected)
        aggregate_urls.update(file_urls)

        wildcard_count = sum(1 for item in file_valid_entries if "*." in item or item.startswith("*"))
        fqdn_count = len(file_valid_entries) - len(file_ips) - wildcard_count

        per_file_counts.append(
            f"{path.name}\tFQDNs={fqdn_count}\tWildcardDNS={wildcard_count}\tIPv4s={len(file_ips)}\tRejected={len(file_rejected)}\tURLs={len(file_urls)}"
        )

        print(
            f"Processed {path.name}: "
            f"FQDNs={fqdn_count} WildcardDNS={wildcard_count} IPv4s={len(file_ips)} "
            f"Rejected={len(file_rejected)} URLs={len(file_urls)}"
        )

    merged_valid = sorted(aggregate_valid_entries)
    write_sorted_lines(output_file, merged_valid)
    write_sorted_lines(trash_dir / f"{TYPE}-rejected-candidates.txt", aggregate_rejected)
    write_sorted_lines(trash_dir / f"{TYPE}-url-review.txt", aggregate_urls)

    write_sorted_lines(log_dir / f"{TYPE}-valid_dns_entries.txt", aggregate_valid_entries)
    write_sorted_lines(log_dir / f"{TYPE}-valid_ipv4.txt", aggregate_ips)
    write_sorted_lines(log_dir / f"{TYPE}-rejected-candidates.txt", aggregate_rejected)
    write_sorted_lines(log_dir / f"{TYPE}-url-review.txt", aggregate_urls)

    for path in inputs:
        try:
            path.unlink()
            deleted_files.append(str(path))
        except OSError as exc:
            delete_failures.append(f"{path}\t{exc}")

    aggregate_wildcards = sum(1 for item in aggregate_valid_entries if "*" in item)
    aggregate_fqdns = len(aggregate_valid_entries) - len(aggregate_ips) - aggregate_wildcards

    summary_lines = [
        f"Script: {script_path}",
        f"SHIELD root: {shield_root}",
        f"Input directory: {input_dir}",
        f"Output file: {output_file}",
        f"Trash directory: {trash_dir}",
        f"Log directory: {log_dir}",
        f"Processed files: {len(inputs)}",
        f"Unique valid FQDNs: {aggregate_fqdns}",
        f"Unique valid wildcard DNS entries: {aggregate_wildcards}",
        f"Unique valid IPv4s: {len(aggregate_ips)}",
        f"Unique valid total: {len(merged_valid)}",
        f"Unique rejected candidates: {len(aggregate_rejected)}",
        f"Unique URLs for review: {len(aggregate_urls)}",
        f"Deleted input files: {len(deleted_files)}",
        f"Delete failures: {len(delete_failures)}",
        "",
        "Per-file counts:",
        *per_file_counts,
    ]

    if deleted_files:
        summary_lines.extend(["", "Deleted files:", *deleted_files])

    if delete_failures:
        summary_lines.extend(["", "Delete failures:", *delete_failures])

    (log_dir / "summary.txt").write_text("\n".join(summary_lines) + "\n", encoding="utf-8")
    (log_dir / "run.log").write_text(
        "\n".join(
            [
                f"[{datetime.now().isoformat()}] Cleanup run completed.",
                *summary_lines,
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    if delete_failures:
        print("Completed with delete failures. Check run.log for details.", file=sys.stderr)
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())