#!/usr/bin/env python3
"""Queue-scoped URLhaus host classifier."""
from __future__ import annotations

import os
import sys
from pathlib import Path


repo_root = Path(os.environ.get("AEGIS_REPO_ROOT", Path(__file__).resolve().parents[3])).resolve()
sys.path.insert(0, str(repo_root / "pipeline" / "lib" / "python"))
from external_provider import compact_json, emit, env_bool, http_json, provider_main, slug_category  # noqa: E402


SPAMHAUS_DBL_CATEGORIES = {
    "spammer_domain": ["spam"],
    "phishing_domain": ["phishing"],
    "botnet_cc_domain": ["c2"],
    "abused_legit_spam": ["spam"],
    "abused_legit_malware": ["malware"],
    "abused_legit_phishing": ["phishing"],
    "abused_legit_botnetcc": ["c2"],
}


def categories_from_response(data: object, emit_tags: bool = True) -> list[str]:
    if not isinstance(data, dict) or data.get("query_status") != "ok":
        return []

    categories: set[str] = set()
    blacklists = data.get("blacklists")
    if isinstance(blacklists, dict):
        for category in SPAMHAUS_DBL_CATEGORIES.get(str(blacklists.get("spamhaus_dbl", "")), []):
            categories.add(category)
        if str(blacklists.get("surbl", "")).lower() == "listed":
            categories.add("malware")

    urls = data.get("urls")
    if isinstance(urls, list):
        for item in urls:
            if not isinstance(item, dict):
                continue
            if item.get("threat"):
                categories.add("malware")
            if emit_tags:
                for tag in item.get("tags") or []:
                    slug = slug_category(tag)
                    if slug:
                        categories.add(slug)

    if data.get("url_count") and not categories:
        categories.add("malware")
    return sorted(categories)


def main() -> int:
    auth_key = os.environ.get("URLHAUS_AUTH_KEY", "").strip()
    if not auth_key or auth_key.lower() in {"changeme", "change-me", "todo"}:
        print("[urlhaus] missing URLHAUS_AUTH_KEY; skipping", file=sys.stderr)
        return 0

    endpoint = os.environ.get("URLHAUS_API_URL", "https://urlhaus-api.abuse.ch/v1/host/")
    emit_tags = env_bool("URLHAUS_EMIT_TAG_CATEGORIES", True)

    def lookup(kind: str, entry: str) -> None:
        _status, data = http_json(
            endpoint,
            method="POST",
            headers={"Auth-Key": auth_key},
            form={"host": entry},
            timeout=30,
        )
        for category in categories_from_response(data, emit_tags=emit_tags):
            emit(kind, entry, category, "high", f"urlhaus:{compact_json(data)[:400]}")

    return provider_main(lookup)


if __name__ == "__main__":
    sys.exit(main())
