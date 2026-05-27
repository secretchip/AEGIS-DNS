#!/usr/bin/env python3
"""Queue-scoped AbuseIPDB IP classifier."""
from __future__ import annotations

import os
import sys
import urllib.parse
from pathlib import Path


repo_root = Path(os.environ.get("AEGIS_REPO_ROOT", Path(__file__).resolve().parents[3])).resolve()
sys.path.insert(0, str(repo_root / "pipeline" / "lib" / "python"))
from external_provider import compact_json, emit, env_bool, env_int, http_json, provider_main  # noqa: E402


REPORT_CATEGORY_MAP = {
    3: "fraud",
    4: "ddos",
    5: "ftp-bruteforce",
    6: "ssh",
    7: "spam",
    9: "proxy",
    10: "web-spam",
    11: "email-spam",
    14: "port-scan",
    15: "hacking",
    18: "brute-force",
    19: "bad-web-bot",
    20: "exploited-host",
    21: "web-app-attack",
    22: "ssh",
    23: "iot-targeted",
}


def categories_from_response(
    data: object,
    malicious_threshold: int = 75,
    abuse_threshold: int = 25,
) -> list[str]:
    if not isinstance(data, dict) or not isinstance(data.get("data"), dict):
        return []
    info = data["data"]
    if info.get("isWhitelisted") is True:
        return []

    categories: set[str] = set()
    score = int(info.get("abuseConfidenceScore") or 0)
    if score >= abuse_threshold:
        categories.add("abuse")
    if score >= malicious_threshold:
        categories.add("malicious")

    for report in info.get("reports") or []:
        if not isinstance(report, dict):
            continue
        for raw_category in report.get("categories") or []:
            category = REPORT_CATEGORY_MAP.get(int(raw_category))
            if category:
                categories.add(category)
    return sorted(categories)


def main() -> int:
    api_key = os.environ.get("ABUSEIPDB_API_KEY", "").strip()
    if not api_key or api_key.lower() in {"changeme", "change-me", "todo"}:
        print("[abuseipdb] missing ABUSEIPDB_API_KEY; skipping", file=sys.stderr)
        return 0

    endpoint = os.environ.get("ABUSEIPDB_API_URL", "https://api.abuseipdb.com/api/v2/check")
    max_age = env_int("ABUSEIPDB_MAX_AGE_DAYS", 90)
    verbose = env_bool("ABUSEIPDB_VERBOSE", True)
    abuse_threshold = env_int("ABUSEIPDB_ABUSE_THRESHOLD", 25)
    malicious_threshold = env_int("ABUSEIPDB_MALICIOUS_THRESHOLD", 75)

    def lookup(kind: str, entry: str) -> None:
        if kind != "ipv4":
            return
        query = {
            "ipAddress": entry,
            "maxAgeInDays": str(max_age),
        }
        if verbose:
            query["verbose"] = ""
        url = endpoint + "?" + urllib.parse.urlencode(query)
        _status, data = http_json(
            url,
            headers={"Key": api_key, "Accept": "application/json"},
            timeout=30,
        )
        for category in categories_from_response(data, malicious_threshold, abuse_threshold):
            score = ""
            if isinstance(data, dict) and isinstance(data.get("data"), dict):
                score = str(data["data"].get("abuseConfidenceScore", ""))
            emit(kind, entry, category, score, f"abuseipdb:{compact_json(data)[:400]}")

    return provider_main(lookup)


if __name__ == "__main__":
    sys.exit(main())
