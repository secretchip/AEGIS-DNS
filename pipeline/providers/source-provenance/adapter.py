#!/usr/bin/env python3
"""Classify entries from cleanup provenance files and source-category rules."""
from __future__ import annotations

import csv
import os
import re
import sys
from pathlib import Path


repo_root = Path(os.environ["AEGIS_REPO_ROOT"]).resolve()


def resolve_repo_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return repo_root / path


def slug_values(value: str) -> list[str]:
    return [item.strip() for item in re.split(r"[, ]+", value.strip()) if item.strip()]


def load_rules(path: Path) -> list[tuple[str, str, list[str]]]:
    rules: list[tuple[str, str, list[str]]] = []
    if not path.exists():
        print(f"[source-provenance] missing source category map: {path}", file=sys.stderr)
        return rules

    with path.open("r", encoding="utf-8", errors="ignore") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            parts = [part.strip() for part in line.split("\t")]
            if len(parts) == 2:
                match_type, pattern, categories = "exact", parts[0], parts[1]
            elif len(parts) >= 3:
                match_type, pattern, categories = parts[0], parts[1], parts[2]
            else:
                continue
            if match_type.lower() in {"match_type", "type"}:
                continue
            category_values = slug_values(categories)
            if pattern and category_values:
                rules.append((match_type.lower(), pattern, category_values))
    return rules


def categories_for_source(source_url: str, rules: list[tuple[str, str, list[str]]]) -> list[str]:
    categories: set[str] = set()
    for match_type, pattern, rule_categories in rules:
        matched = False
        if match_type == "exact":
            matched = source_url == pattern
        elif match_type == "contains":
            matched = pattern in source_url
        elif match_type == "prefix":
            matched = source_url.startswith(pattern)
        elif match_type == "regex":
            try:
                matched = re.search(pattern, source_url) is not None
            except re.error:
                matched = False
        if matched:
            categories.update(rule_categories)
    return sorted(categories)


def iter_manifest_rows(path: Path):
    if not path.exists():
        print(f"[source-provenance] missing provenance manifest: {path}", file=sys.stderr)
        return
    with path.open("r", encoding="utf-8", errors="ignore", newline="") as fh:
        reader = csv.DictReader(fh, delimiter="\t")
        for row in reader:
            yield row


def emit_file(kind: str, path: Path, categories: list[str], source_url: str) -> None:
    if not path.exists():
        return
    with path.open("r", encoding="utf-8", errors="ignore") as fh:
        for raw in fh:
            entry = raw.strip()
            if not entry or entry.startswith("#"):
                continue
            for category in categories:
                print(f"{kind}\t{entry}\t{category}\tsource\t{source_url}")


def main() -> int:
    provenance_root = resolve_repo_path(
        os.environ.get("AEGIS_SOURCE_PROVENANCE_DIR", "var/intake/block/provenance/current")
    )
    rules_path = resolve_repo_path(
        os.environ.get("AEGIS_SOURCE_CATEGORY_MAP", "sources/block_source_categories.tsv")
    )
    rules = load_rules(rules_path)
    if not rules:
        return 0

    manifest = provenance_root / "manifest.tsv"
    for row in iter_manifest_rows(manifest) or []:
        source_url = row.get("source_url", "")
        categories = categories_for_source(source_url, rules)
        if not categories:
            continue
        domains_file = row.get("domains_file", "")
        ips_file = row.get("ips_file", "")
        if domains_file:
            emit_file("domain", provenance_root / domains_file, categories, source_url)
        if ips_file:
            emit_file("ipv4", provenance_root / ips_file, categories, source_url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
