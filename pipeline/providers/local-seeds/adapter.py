#!/usr/bin/env python3
"""Classify final block-list entries from local category seed files."""
from __future__ import annotations

import os
import re
import sys
from collections import defaultdict
from pathlib import Path


repo_root = Path(os.environ["AEGIS_REPO_ROOT"]).resolve()
sys.path.insert(0, str(repo_root / "pipeline" / "lib" / "python"))
from validate import load_or_fetch_iana_tlds, validate_entry  # noqa: E402


TRAILING_COMMENT_RE = re.compile(r"\s*#.*$")


def iter_seed_files(seed_root: Path):
    if not seed_root.is_dir():
        return
    for category_dir in sorted(path for path in seed_root.iterdir() if path.is_dir()):
        for path in sorted(p for p in category_dir.rglob("*") if p.is_file()):
            yield category_dir.name, path


def load_seed_map(seed_root: Path) -> dict[tuple[str, str], set[str]]:
    tlds = load_or_fetch_iana_tlds(repo_root / "var" / "state" / "iana-tlds.txt")
    seeds: dict[tuple[str, str], set[str]] = defaultdict(set)
    for category, path in iter_seed_files(seed_root) or []:
        with path.open("r", encoding="utf-8", errors="ignore") as fh:
            for raw in fh:
                value = TRAILING_COMMENT_RE.sub("", raw.strip()).strip()
                if not value:
                    continue
                result = validate_entry(value, tlds)
                if result.valid:
                    seeds[(result.kind, result.normalized)].add(category)
    return seeds


def main() -> int:
    input_path = Path(os.environ["AEGIS_CATEGORY_INPUT"])
    seed_dir = os.environ.get("AEGIS_LOCAL_SEEDS_DIR", "sources/external-sources")
    seed_root = Path(seed_dir)
    if not seed_root.is_absolute():
        seed_root = repo_root / seed_root

    seeds = load_seed_map(seed_root)
    with input_path.open("r", encoding="utf-8") as fh:
        for raw in fh:
            row = raw.rstrip("\n").split("\t", 1)
            if len(row) != 2:
                continue
            kind, entry = row
            for category in sorted(seeds.get((kind, entry), ())):
                print(f"{kind}\t{entry}\t{category}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
