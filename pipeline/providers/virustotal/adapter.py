#!/usr/bin/env python3
"""Queue-scoped VirusTotal classifier."""
from __future__ import annotations

import os
import sys
import urllib.parse
from pathlib import Path


repo_root = Path(os.environ.get("AEGIS_REPO_ROOT", Path(__file__).resolve().parents[3])).resolve()
sys.path.insert(0, str(repo_root / "pipeline" / "lib" / "python"))
from external_provider import compact_json, emit, env_int, http_json, provider_main  # noqa: E402


CATEGORY_KEYWORDS = {
    "phishing": "phishing",
    "malware": "malware",
    "spam": "spam",
    "botnet": "c2",
    "command": "c2",
    "ad": "ads",
    "advertising": "ads",
    "tracking": "tracking",
    "tracker": "tracking",
    "gambling": "gambling",
    "crypto": "crypto",
    "miner": "crypto",
}


def categories_from_response(
    data: object,
    malicious_threshold: int = 2,
    suspicious_threshold: int = 1,
) -> list[str]:
    if not isinstance(data, dict):
        return []
    attrs = ((data.get("data") or {}).get("attributes") or {}) if isinstance(data.get("data"), dict) else {}
    if not isinstance(attrs, dict):
        return []

    categories: set[str] = set()
    stats = attrs.get("last_analysis_stats")
    if isinstance(stats, dict):
        if int(stats.get("malicious") or 0) >= malicious_threshold:
            categories.add("malicious")
        if int(stats.get("suspicious") or 0) >= suspicious_threshold:
            categories.add("suspicious")

    vt_categories = attrs.get("categories")
    if isinstance(vt_categories, dict):
        for raw_value in vt_categories.values():
            lowered = str(raw_value).lower()
            for needle, category in CATEGORY_KEYWORDS.items():
                if needle in lowered:
                    categories.add(category)
    return sorted(categories)


def endpoint_for_indicator(base_url: str, kind: str, entry: str) -> str:
    encoded = urllib.parse.quote(entry, safe="")
    if kind == "ipv4":
        return f"{base_url}/ip_addresses/{encoded}"
    return f"{base_url}/domains/{encoded}"


def main() -> int:
    api_key = os.environ.get("VIRUSTOTAL_API_KEY", "").strip()
    if not api_key or api_key.lower() in {"changeme", "change-me", "todo"}:
        print("[virustotal] missing VIRUSTOTAL_API_KEY; skipping", file=sys.stderr)
        return 0

    base_url = os.environ.get("VIRUSTOTAL_API_URL", "https://www.virustotal.com/api/v3").rstrip("/")
    malicious_threshold = env_int("VIRUSTOTAL_MALICIOUS_THRESHOLD", 2)
    suspicious_threshold = env_int("VIRUSTOTAL_SUSPICIOUS_THRESHOLD", 1)

    def lookup(kind: str, entry: str) -> None:
        _status, data = http_json(
            endpoint_for_indicator(base_url, kind, entry),
            headers={"x-apikey": api_key, "Accept": "application/json"},
            timeout=30,
            accepted_statuses=(200, 404),
        )
        for category in categories_from_response(data, malicious_threshold, suspicious_threshold):
            confidence = ""
            if isinstance(data, dict):
                attrs = ((data.get("data") or {}).get("attributes") or {}) if isinstance(data.get("data"), dict) else {}
                if isinstance(attrs, dict):
                    confidence = compact_json(attrs.get("last_analysis_stats", {}))
            emit(kind, entry, category, confidence, f"virustotal:{compact_json(data)[:400]}")

    return provider_main(lookup)


if __name__ == "__main__":
    sys.exit(main())
