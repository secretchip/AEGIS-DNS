#!/usr/bin/env python3
"""Queue-scoped GreyNoise Community IP classifier."""
from __future__ import annotations

import os
import sys
from pathlib import Path


repo_root = Path(os.environ.get("AEGIS_REPO_ROOT", Path(__file__).resolve().parents[3])).resolve()
sys.path.insert(0, str(repo_root / "pipeline" / "lib" / "python"))
from external_provider import compact_json, emit, http_json, provider_main  # noqa: E402


def categories_from_response(data: object) -> list[str]:
    if not isinstance(data, dict):
        return []
    categories: set[str] = set()
    classification = str(data.get("classification", "")).lower()
    if data.get("noise") is True:
        categories.add("internet-scanner")
    if classification == "malicious":
        categories.add("malicious")
    elif classification == "suspicious":
        categories.add("suspicious")
    return sorted(categories)


def main() -> int:
    api_key = os.environ.get("GREYNOISE_API_KEY", "").strip()
    if not api_key or api_key.lower() in {"changeme", "change-me", "todo"}:
        print("[greynoise] missing GREYNOISE_API_KEY; skipping", file=sys.stderr)
        return 0

    endpoint = os.environ.get("GREYNOISE_API_URL", "https://api.greynoise.io/v3/community").rstrip("/")

    def lookup(kind: str, entry: str) -> None:
        if kind != "ipv4":
            return
        _status, data = http_json(
            f"{endpoint}/{entry}",
            headers={"key": api_key, "Accept": "application/json"},
            timeout=30,
            accepted_statuses=(200, 404),
        )
        for category in categories_from_response(data):
            confidence = ""
            if isinstance(data, dict):
                confidence = str(data.get("classification", ""))
            emit(kind, entry, category, confidence, f"greynoise:{compact_json(data)[:400]}")

    return provider_main(lookup)


if __name__ == "__main__":
    sys.exit(main())
