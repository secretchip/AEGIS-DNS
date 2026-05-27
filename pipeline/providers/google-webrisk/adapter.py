#!/usr/bin/env python3
"""Queue-scoped Google Web Risk classifier."""
from __future__ import annotations

import os
import sys
import urllib.parse
from pathlib import Path


repo_root = Path(os.environ.get("AEGIS_REPO_ROOT", Path(__file__).resolve().parents[3])).resolve()
sys.path.insert(0, str(repo_root / "pipeline" / "lib" / "python"))
from external_provider import compact_json, emit, http_json, provider_main  # noqa: E402


THREAT_TYPE_CATEGORIES = {
    "MALWARE": "malware",
    "SOCIAL_ENGINEERING": "phishing",
    "UNWANTED_SOFTWARE": "unwanted-software",
    "SOCIAL_ENGINEERING_EXTENDED_COVERAGE": "phishing",
}


def categories_from_response(data: object) -> list[str]:
    if not isinstance(data, dict):
        return []
    threat = data.get("threat")
    if not isinstance(threat, dict):
        return []
    categories = {
        THREAT_TYPE_CATEGORIES[item]
        for item in threat.get("threatTypes") or []
        if item in THREAT_TYPE_CATEGORIES
    }
    return sorted(categories)


def uri_for_indicator(kind: str, entry: str) -> str:
    if kind == "ipv4":
        return f"http://{entry}/"
    return f"https://{entry}/"


def main() -> int:
    api_key = os.environ.get("GOOGLE_WEBRISK_API_KEY", "").strip()
    bearer = os.environ.get("GOOGLE_WEBRISK_BEARER_TOKEN", "").strip()
    if api_key.lower() in {"changeme", "change-me", "todo"}:
        api_key = ""
    if not api_key and not bearer:
        print("[google-webrisk] missing GOOGLE_WEBRISK_API_KEY or GOOGLE_WEBRISK_BEARER_TOKEN; skipping", file=sys.stderr)
        return 0

    endpoint = os.environ.get("GOOGLE_WEBRISK_API_URL", "https://webrisk.googleapis.com/v1/uris:search")
    threat_types = [
        item.strip()
        for item in os.environ.get(
            "GOOGLE_WEBRISK_THREAT_TYPES",
            "MALWARE,SOCIAL_ENGINEERING,UNWANTED_SOFTWARE,SOCIAL_ENGINEERING_EXTENDED_COVERAGE",
        ).split(",")
        if item.strip()
    ]

    def lookup(kind: str, entry: str) -> None:
        query_items = [("uri", uri_for_indicator(kind, entry))]
        query_items.extend(("threatTypes", threat_type) for threat_type in threat_types)
        if api_key:
            query_items.append(("key", api_key))
        headers = {"Accept": "application/json"}
        if bearer:
            headers["Authorization"] = f"Bearer {bearer}"
        _status, data = http_json(
            endpoint + "?" + urllib.parse.urlencode(query_items),
            headers=headers,
            timeout=30,
        )
        for category in categories_from_response(data):
            emit(kind, entry, category, "high", f"google-webrisk:{compact_json(data)[:400]}")

    return provider_main(lookup)


if __name__ == "__main__":
    sys.exit(main())
