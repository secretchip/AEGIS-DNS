#!/usr/bin/env python3
"""Queue-scoped ThreatFox IOC classifier."""
from __future__ import annotations

import os
import sys
from pathlib import Path


repo_root = Path(os.environ.get("AEGIS_REPO_ROOT", Path(__file__).resolve().parents[3])).resolve()
sys.path.insert(0, str(repo_root / "pipeline" / "lib" / "python"))
from external_provider import compact_json, emit, env_bool, http_json, provider_main, slug_category  # noqa: E402


THREAT_TYPE_CATEGORIES = {
    "botnet_cc": ["c2"],
    "payload_delivery": ["malware"],
    "malware_download": ["malware"],
    "phishing": ["phishing"],
    "cc_skimming": ["skimmer"],
}


def categories_from_response(
    data: object,
    emit_malware_families: bool = True,
    emit_tags: bool = True,
) -> list[str]:
    if not isinstance(data, dict) or data.get("query_status") != "ok":
        return []

    categories: set[str] = set()
    rows = data.get("data")
    if not isinstance(rows, list):
        return []

    for row in rows:
        if not isinstance(row, dict):
            continue
        for category in THREAT_TYPE_CATEGORIES.get(str(row.get("threat_type", "")), []):
            categories.add(category)
        if emit_malware_families:
            family = row.get("malware_printable") or row.get("malware")
            slug = slug_category(family)
            if slug and slug not in {"unknown", "none", "malware"}:
                categories.add(slug)
        if emit_tags:
            for tag in row.get("tags") or []:
                slug = slug_category(tag)
                if slug:
                    categories.add(slug)
    return sorted(categories)


def main() -> int:
    auth_key = os.environ.get("THREATFOX_AUTH_KEY", "").strip()
    if not auth_key or auth_key.lower() in {"changeme", "change-me", "todo"}:
        print("[threatfox] missing THREATFOX_AUTH_KEY; skipping", file=sys.stderr)
        return 0

    endpoint = os.environ.get("THREATFOX_API_URL", "https://threatfox-api.abuse.ch/api/v1/")
    emit_families = env_bool("THREATFOX_EMIT_MALWARE_FAMILIES", True)
    emit_tags = env_bool("THREATFOX_EMIT_TAG_CATEGORIES", True)

    def lookup(kind: str, entry: str) -> None:
        _status, data = http_json(
            endpoint,
            method="POST",
            headers={"Auth-Key": auth_key},
            body={"query": "search_ioc", "search_term": entry, "exact_match": True},
            timeout=30,
        )
        categories = categories_from_response(
            data,
            emit_malware_families=emit_families,
            emit_tags=emit_tags,
        )
        confidence = ""
        if isinstance(data, dict) and isinstance(data.get("data"), list) and data["data"]:
            confidence = str(data["data"][0].get("confidence_level", ""))
        for category in categories:
            emit(kind, entry, category, confidence, f"threatfox:{compact_json(data)[:400]}")

    return provider_main(lookup)


if __name__ == "__main__":
    sys.exit(main())
