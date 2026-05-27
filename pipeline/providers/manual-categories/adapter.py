#!/usr/bin/env python3
"""Classify final block-list entries from manual campaign category files."""
from __future__ import annotations

import os
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlsplit


repo_root = Path(os.environ["AEGIS_REPO_ROOT"]).resolve()
sys.path.insert(0, str(repo_root / "pipeline" / "lib" / "python"))
from validate import load_or_fetch_iana_tlds, validate_entry  # noqa: E402


def normalize_indicator(value: str, tlds: set[str]) -> tuple[str, str] | None:
    raw = value.strip()
    if not raw or raw.startswith("#"):
        return None

    candidate = raw
    parsed = urlsplit(raw)
    if parsed.scheme and parsed.hostname:
        candidate = parsed.hostname
    elif "/" in raw:
        parsed = urlsplit(f"//{raw}")
        if parsed.hostname:
            candidate = parsed.hostname
    elif raw.count(":") == 1 and not raw.startswith("*."):
        host, maybe_port = raw.rsplit(":", 1)
        if maybe_port.isdigit():
            candidate = host

    result = validate_entry(candidate.strip("[]").rstrip("."), tlds)
    if not result.valid:
        return None
    return result.kind, result.normalized


def iter_campaign_files(root: Path):
    if not root.is_dir():
        return
    for path in sorted(root.glob("*")):
        if not path.is_file() or path.name.startswith("_"):
            continue
        yield path


def parse_campaign_file(path: Path, tlds: set[str]) -> tuple[str, list[tuple[str, str]]]:
    category = ""
    entries: list[tuple[str, str]] = []
    with path.open("r", encoding="utf-8", errors="ignore") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.strip().lower()
            value = value.strip()
            if key in {"category", "name"}:
                category = value
            elif key in {"entry", "indicator", "url", "ip", "domain"}:
                normalized = normalize_indicator(value, tlds)
                if normalized is not None:
                    entries.append(normalized)
            elif key == "source":
                continue
    return category, entries


def load_manual_map(root: Path) -> dict[tuple[str, str], set[str]]:
    tlds = load_or_fetch_iana_tlds(repo_root / "var" / "state" / "iana-tlds.txt")
    manual: dict[tuple[str, str], set[str]] = defaultdict(set)
    for path in iter_campaign_files(root) or []:
        category, entries = parse_campaign_file(path, tlds)
        if not category:
            print(f"[manual-categories] skipping {path}: missing category", file=sys.stderr)
            continue
        for item in entries:
            manual[item].add(category)
    return manual


def main() -> int:
    input_path = Path(os.environ["AEGIS_CATEGORY_INPUT"])
    manual_dir = os.environ.get("AEGIS_MANUAL_CATEGORIES_DIR", "sources/manual-categories")
    manual_root = Path(manual_dir)
    if not manual_root.is_absolute():
        manual_root = repo_root / manual_root

    manual = load_manual_map(manual_root)
    with input_path.open("r", encoding="utf-8") as fh:
        for raw in fh:
            row = raw.rstrip("\n").split("\t", 1)
            if len(row) != 2:
                continue
            kind, entry = row
            for category in sorted(manual.get((kind, entry), ())):
                print(f"{kind}\t{entry}\t{category}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
