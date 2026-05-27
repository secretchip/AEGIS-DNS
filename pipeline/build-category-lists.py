#!/usr/bin/env python3
"""
Build per-category block lists from the final published block corpus.

Reads final block chunks from:
    public_block_lists/domains/hosts-block-part*.txt
    public_block_lists/ips/ips-block-part*.txt

Classifier modules live under:
    pipeline/providers/<provider-name>/

Each provider module supplies:
    module.env.template
    adapter.py  (or executable adapter)

Runtime provider env files are optional and gitignored:
    var/secrets/providers/<provider-name>.env

Adapter contract:
    Input path: AEGIS_CATEGORY_INPUT
    Input rows: kind<TAB>entry where kind is domain or ipv4
    Stdout rows: kind<TAB>entry<TAB>category[<TAB>confidence<TAB>evidence]

Outputs:
    public_block_categories_lists/{domains,ips}/<category>/*partN.txt
    public_block_categories_lists/manifest.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, NamedTuple
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib" / "python"))
from classification_cache import ClassificationCache, add_days, utc_now_iso  # noqa: E402
from validate import load_or_fetch_iana_tlds, validate_entry  # noqa: E402


REPO_BASE_URL = "https://raw.githubusercontent.com/secretchip/AEGIS-DNS/refs/heads/main"
DEFAULT_MAX_LINES = 2_000_000
DEFAULT_MAX_BYTES = 50 * 1024 * 1024
MISSING_VALUES = {"", "changeme", "change-me", "replace_me", "replace-me", "todo", "..."}


class ProviderModule(NamedTuple):
    name: str
    module_dir: Path
    adapter: Path
    env: dict[str, str]


class CorpusInfo(NamedTuple):
    counts: dict[str, int]
    domains_filter: Path
    ips_filter: Path


class ProviderClassification(NamedTuple):
    kind: str
    entry: str
    category: str
    confidence: str
    evidence: str


class CategorySink:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.handles = {}

    def write(self, kind_dir: str, category: str, entry: str) -> None:
        key = (kind_dir, category)
        handle = self.handles.get(key)
        if handle is None:
            path = self.root / kind_dir / f"{category}.txt"
            path.parent.mkdir(parents=True, exist_ok=True)
            handle = path.open("a", encoding="utf-8")
            self.handles[key] = handle
        handle.write(entry + "\n")

    def close(self) -> None:
        for handle in self.handles.values():
            handle.close()
        self.handles.clear()


class EvidenceSink:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.handle = path.open("a", encoding="utf-8")

    def write(
        self,
        provider: str,
        classification: ProviderClassification,
    ) -> None:
        fields = [
            provider,
            classification.kind,
            classification.entry,
            classification.category,
            classification.confidence,
            classification.evidence,
        ]
        self.handle.write("\t".join(sanitize_tsv_field(field) for field in fields) + "\n")

    def close(self) -> None:
        self.handle.close()


def sanitize_tsv_field(value: str) -> str:
    return value.replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()


def slugify_category(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return slug.strip("-")


def load_category_aliases(repo_root: Path) -> dict[str, str]:
    aliases: dict[str, str] = {}
    path = repo_root / "sources" / "category_aliases.tsv"
    if not path.exists():
        return aliases
    with path.open("r", encoding="utf-8", errors="ignore") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            parts = [part.strip() for part in line.split("\t")]
            if len(parts) < 2:
                parts = [part.strip() for part in re.split(r"\s+", line, maxsplit=1)]
            if len(parts) < 2 or parts[0].lower() == "alias":
                continue
            alias = slugify_category(parts[0])
            canonical = slugify_category(parts[1])
            if alias and canonical:
                aliases[alias] = canonical
    return aliases


def canonical_category(value: str, aliases: dict[str, str]) -> str:
    slug = slugify_category(value)
    return aliases.get(slug, slug)


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


def parse_env_file(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    with path.open("r", encoding="utf-8", errors="ignore") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                env[key] = value
    return env


def env_enabled(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def is_missing_value(value: str | None) -> bool:
    if value is None:
        return True
    return value.strip().lower() in MISSING_VALUES


def split_required(value: str | None) -> list[str]:
    if not value:
        return []
    return [item for item in re.split(r"[\s,]+", value.strip()) if item]


def find_adapter(module_dir: Path) -> Path | None:
    py_adapter = module_dir / "adapter.py"
    if py_adapter.is_file():
        return py_adapter
    adapter = module_dir / "adapter"
    if adapter.is_file():
        return adapter
    return None


def discover_provider_modules(repo_root: Path, provider_root: Path | None = None) -> list[ProviderModule]:
    provider_root = provider_root or repo_root / "pipeline" / "providers"
    if not provider_root.is_dir():
        return []

    modules: list[ProviderModule] = []
    for module_dir in sorted(path for path in provider_root.iterdir() if path.is_dir()):
        template = module_dir / "module.env.template"
        adapter = find_adapter(module_dir)
        if not template.exists() or adapter is None:
            continue

        env = parse_env_file(template)
        secret_file = repo_root / "var" / "secrets" / "providers" / f"{module_dir.name}.env"
        env.update(parse_env_file(secret_file))

        # Shell-set values override template and runtime env files.
        for key in list(env):
            if key in os.environ:
                env[key] = os.environ[key]

        if not env_enabled(env.get("AEGIS_PROVIDER_ENABLED")):
            continue

        required = split_required(env.get("AEGIS_PROVIDER_REQUIRED_ENV"))
        missing = [key for key in required if is_missing_value(env.get(key) or os.environ.get(key))]
        if missing:
            print(
                f"[categories] skipping provider {module_dir.name}: missing {', '.join(missing)}",
                file=sys.stderr,
            )
            continue

        modules.append(ProviderModule(module_dir.name, module_dir, adapter, env))
    return modules


def part_index(path: Path) -> int:
    match = re.search(r"part(\d+)", path.name)
    return int(match.group(1)) if match else -1


def iter_block_chunk_lines(repo_root: Path, kind_dir: str) -> Iterable[str]:
    if kind_dir == "domains":
        directory = repo_root / "public_block_lists" / "domains"
        pattern = "hosts-block-part*.txt"
    else:
        directory = repo_root / "public_block_lists" / "ips"
        pattern = "ips-block-part*.txt"
    for path in sorted(directory.glob(pattern), key=part_index):
        with path.open("r", encoding="utf-8", errors="ignore") as fh:
            for raw in fh:
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                yield line


def write_block_corpus(repo_root: Path, out_path: Path, temp_dir: Path) -> CorpusInfo:
    tlds = load_or_fetch_iana_tlds(repo_root / "var" / "state" / "iana-tlds.txt")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    filter_dir = temp_dir / "filters"
    filter_dir.mkdir(parents=True, exist_ok=True)
    domains_filter = filter_dir / "final-domains.txt"
    ips_filter = filter_dir / "final-ips.txt"
    counts = {"domain": 0, "ipv4": 0, "rejected": 0}
    with (
        out_path.open("w", encoding="utf-8") as out,
        domains_filter.open("w", encoding="utf-8") as domains_out,
        ips_filter.open("w", encoding="utf-8") as ips_out,
    ):
        for raw in iter_block_chunk_lines(repo_root, "domains"):
            result = validate_entry(raw, tlds)
            if result.valid and result.kind == "domain":
                out.write(f"domain\t{result.normalized}\n")
                domains_out.write(result.normalized + "\n")
                counts["domain"] += 1
            else:
                counts["rejected"] += 1
        for raw in iter_block_chunk_lines(repo_root, "ips"):
            result = validate_entry(raw, tlds)
            if result.valid and result.kind == "ipv4":
                out.write(f"ipv4\t{result.normalized}\n")
                ips_out.write(result.normalized + "\n")
                counts["ipv4"] += 1
            else:
                counts["rejected"] += 1
    sort_unique(domains_filter, domains_filter)
    sort_unique(ips_filter, ips_filter)
    return CorpusInfo(counts, domains_filter, ips_filter)


def limited_input_file(corpus: Path, temp_dir: Path, provider: ProviderModule) -> Path:
    raw_limit = (
        provider.env.get("AEGIS_PROVIDER_MAX_INPUT_ROWS")
        or provider.env.get("AEGIS_PROVIDER_MAX_REQUESTS_PER_RUN")
        or "0"
    )
    try:
        limit = int(raw_limit)
    except ValueError:
        limit = 0
    if limit <= 0:
        return corpus

    limited = temp_dir / f"input-{provider.name}.tsv"
    with corpus.open("r", encoding="utf-8") as src, limited.open("w", encoding="utf-8") as dst:
        for idx, line in enumerate(src):
            if idx >= limit:
                break
            dst.write(line)
    return limited


def adapter_command(adapter: Path) -> list[str]:
    if adapter.suffix == ".py":
        return [sys.executable, str(adapter)]
    return [str(adapter)]


def normalize_kind(value: str) -> str:
    lowered = value.strip().lower()
    if lowered in {"domain", "domains"}:
        return "domain"
    if lowered in {"ipv4", "ip", "ips"}:
        return "ipv4"
    return ""


def parse_provider_row(
    raw: str,
    tlds: set[str],
    aliases: dict[str, str],
) -> ProviderClassification | None:
    parts = raw.rstrip("\n").split("\t")
    if len(parts) < 3:
        return None

    kind = normalize_kind(parts[0])
    category = canonical_category(parts[2], aliases)
    if kind == "" or category == "":
        return None

    result = validate_entry(parts[1], tlds)
    if not result.valid or result.kind != kind:
        return None

    confidence = parts[3].strip() if len(parts) >= 4 else ""
    evidence = parts[4].strip() if len(parts) >= 5 else ""
    return ProviderClassification(kind, result.normalized, category, confidence, evidence)


def write_classification(
    classification: ProviderClassification,
    provider: str,
    sink: CategorySink,
    evidence: EvidenceSink,
) -> None:
    sink.write(
        "domains" if classification.kind == "domain" else "ips",
        classification.category,
        classification.entry,
    )
    evidence.write(provider, classification)


def consume_provider_row(
    raw: str,
    provider: str,
    sink: CategorySink,
    evidence: EvidenceSink,
    tlds: set[str],
    aliases: dict[str, str],
) -> ProviderClassification | None:
    classification = parse_provider_row(raw, tlds, aliases)
    if classification is None:
        return None
    write_classification(classification, provider, sink, evidence)
    return classification


def provider_input_scope(provider: ProviderModule) -> str:
    return (
        provider.env.get("AEGIS_PROVIDER_INPUT_SCOPE")
        or provider.env.get("AEGIS_PROVIDER_SCOPE")
        or "corpus"
    ).strip().lower()


def provider_allowed_kinds(provider: ProviderModule) -> set[str]:
    raw = provider.env.get("AEGIS_PROVIDER_ALLOWED_KINDS", "domain,ipv4")
    allowed = {
        normalize_kind(item)
        for item in re.split(r"[\s,]+", raw)
        if item.strip()
    }
    allowed.discard("")
    return allowed or {"domain", "ipv4"}


def provider_int_env(provider: ProviderModule, key: str, default: int) -> int:
    try:
        return int(provider.env.get(key, str(default)))
    except ValueError:
        return default


def cache_ttl_days(provider: ProviderModule, status: str) -> int:
    specific = {
        "hit": "AEGIS_PROVIDER_CACHE_HIT_TTL_DAYS",
        "miss": "AEGIS_PROVIDER_CACHE_MISS_TTL_DAYS",
        "error": "AEGIS_PROVIDER_CACHE_ERROR_TTL_DAYS",
    }.get(status, "AEGIS_PROVIDER_CACHE_MISS_TTL_DAYS")
    fallback = {
        "hit": "90",
        "miss": "30",
        "error": "1",
    }.get(status, "30")
    try:
        return int(provider.env.get(specific, provider.env.get("AEGIS_PROVIDER_CACHE_TTL_DAYS", fallback)))
    except ValueError:
        return int(fallback)


def queue_input_file(
    provider: ProviderModule,
    cache: ClassificationCache,
    temp_dir: Path,
    now: str,
) -> tuple[Path, list[tuple[str, str]]]:
    limit = provider_int_env(provider, "AEGIS_PROVIDER_MAX_REQUESTS_PER_RUN", 100)
    if limit <= 0:
        limit = provider_int_env(provider, "AEGIS_PROVIDER_MAX_INPUT_ROWS", 100)
    path = temp_dir / f"queue-{provider.name}.tsv"
    requested: list[tuple[str, str]] = []
    allowed_kinds = provider_allowed_kinds(provider)
    with path.open("w", encoding="utf-8") as out:
        for row in cache.iter_due_queue(provider=provider.name, limit=limit, now=now):
            if row["kind"] not in allowed_kinds:
                continue
            out.write(f"{row['kind']}\t{row['entry']}\n")
            requested.append((row["kind"], row["entry"]))
    return path, requested


def prepare_cache_filtered_input(
    provider: ProviderModule,
    cache: ClassificationCache,
    input_path: Path,
    temp_dir: Path,
    now: str,
) -> tuple[Path, list[tuple[str, str]], int]:
    provider_version = provider.env.get("AEGIS_PROVIDER_VERSION", "1")
    filtered_path = temp_dir / f"cache-misses-{provider.name}.tsv"
    requested: list[tuple[str, str]] = []
    cached_or_suppressed = 0

    with input_path.open("r", encoding="utf-8") as src, filtered_path.open("w", encoding="utf-8") as dst:
        for raw in src:
            row = raw.rstrip("\n").split("\t", 1)
            if len(row) != 2:
                continue
            kind, entry = row
            cached = cache.lookup(
                provider.name,
                kind,
                entry,
                provider_version=provider_version,
                now=now,
            )
            if cached is not None:
                cached_or_suppressed += 1
                continue
            dst.write(raw)
            requested.append((kind, entry))

    return filtered_path, requested, cached_or_suppressed


def replay_cached_positives(
    provider: ProviderModule,
    cache: ClassificationCache,
    sink: CategorySink,
    evidence: EvidenceSink,
    aliases: dict[str, str],
    now: str,
) -> int:
    replayed = 0
    for row in cache.iter_unexpired_positive(provider=provider.name, now=now):
        for raw_category in row["categories"]:
            category = canonical_category(raw_category, aliases)
            if not category:
                continue
            classification = ProviderClassification(
                row["kind"],
                row["entry"],
                category,
                row.get("confidence", ""),
                row.get("evidence", "cache"),
            )
            write_classification(classification, provider.name, sink, evidence)
            replayed += 1
    return replayed


def cache_provider_results(
    provider: ProviderModule,
    cache: ClassificationCache,
    requested_rows: list[tuple[str, str]],
    hits: dict[tuple[str, str], list[ProviderClassification]],
    now: str,
) -> None:
    provider_version = provider.env.get("AEGIS_PROVIDER_VERSION", "1")
    hit_expires = add_days(now, cache_ttl_days(provider, "hit"))
    miss_expires = add_days(now, cache_ttl_days(provider, "miss"))

    for key in requested_rows:
        classifications = hits.get(key, [])
        if classifications:
            cache.upsert_result(
                provider=provider.name,
                kind=key[0],
                entry=key[1],
                status="hit",
                categories=[item.category for item in classifications],
                confidence=",".join(sorted({item.confidence for item in classifications if item.confidence})),
                evidence=" | ".join(item.evidence for item in classifications if item.evidence),
                fetched_at=now,
                expires_at=hit_expires,
                provider_version=provider_version,
            )
            cache.delete_queue_candidate(provider.name, key[0], key[1])
        else:
            cache.upsert_result(
                provider=provider.name,
                kind=key[0],
                entry=key[1],
                status="miss",
                categories=[],
                confidence="",
                evidence="no category returned",
                fetched_at=now,
                expires_at=miss_expires,
                provider_version=provider_version,
            )
            cache.delete_queue_candidate(provider.name, key[0], key[1])


def run_provider_modules(
    repo_root: Path,
    modules: list[ProviderModule],
    corpus: Path,
    temp_dir: Path,
    log_dir: Path,
    generated_at: str,
    mode: str = "build",
) -> dict[str, dict[str, int]]:
    tlds = load_or_fetch_iana_tlds(repo_root / "var" / "state" / "iana-tlds.txt")
    aliases = load_category_aliases(repo_root)
    sink = CategorySink(temp_dir / "unsorted")
    evidence = EvidenceSink(temp_dir / "evidence.tsv")
    cache = ClassificationCache(repo_root / "var" / "state" / "classification-cache.sqlite3")
    stats: dict[str, dict[str, int]] = {}
    try:
        for module in modules:
            if mode == "targeted" and not env_enabled(
                module.env.get("AEGIS_PROVIDER_RUN_FOR_TARGETED", "true")
            ):
                continue

            cache_enabled = env_enabled(module.env.get("AEGIS_PROVIDER_CACHE_ENABLED"))
            scope = provider_input_scope(module)
            cached_replayed = 0
            cached_suppressed = 0
            requested_rows: list[tuple[str, str]] = []
            provider_hits: dict[tuple[str, str], list[ProviderClassification]] = {}

            if cache_enabled:
                cached_replayed = replay_cached_positives(
                    module, cache, sink, evidence, aliases, generated_at
                )

            if scope == "queue":
                module_input, requested_rows = queue_input_file(module, cache, temp_dir, generated_at)
                if cache_enabled:
                    module_input, requested_rows, cached_suppressed = prepare_cache_filtered_input(
                        module, cache, module_input, temp_dir, generated_at
                    )
            else:
                module_input = limited_input_file(corpus, temp_dir, module)
                if cache_enabled:
                    module_input, requested_rows, cached_suppressed = prepare_cache_filtered_input(
                        module, cache, module_input, temp_dir, generated_at
                    )

            env = os.environ.copy()
            env.update(module.env)
            env.update({
                "AEGIS_REPO_ROOT": str(repo_root),
                "AEGIS_PROVIDER_NAME": module.name,
                "AEGIS_PROVIDER_MODULE_DIR": str(module.module_dir),
                "AEGIS_CATEGORY_INPUT": str(module_input),
                "AEGIS_CATEGORY_MODE": mode,
            })

            log_dir.mkdir(parents=True, exist_ok=True)
            stderr_path = log_dir / f"{module.name}.stderr.log"
            accepted = 0
            rejected = 0
            return_code = 0
            if not module_input.exists() or module_input.stat().st_size == 0:
                stats[module.name] = {
                    "accepted": 0,
                    "rejected": 0,
                    "cached_replayed": cached_replayed,
                    "cached_suppressed": cached_suppressed,
                    "exit_code": 0,
                }
                continue
            with stderr_path.open("w", encoding="utf-8") as err:
                proc = subprocess.Popen(
                    adapter_command(module.adapter),
                    cwd=str(module.module_dir),
                    env=env,
                    stdout=subprocess.PIPE,
                    stderr=err,
                    text=True,
                    encoding="utf-8",
                )
                assert proc.stdout is not None
                for raw in proc.stdout:
                    classification = consume_provider_row(
                        raw,
                        module.name,
                        sink,
                        evidence,
                        tlds,
                        aliases,
                    )
                    if classification is not None:
                        accepted += 1
                        if cache_enabled:
                            provider_hits.setdefault(
                                (classification.kind, classification.entry), []
                            ).append(classification)
                    else:
                        rejected += 1
                proc.stdout.close()
                return_code = proc.wait()

            if cache_enabled and return_code == 0:
                cache_provider_results(module, cache, requested_rows, provider_hits, generated_at)

            stats[module.name] = {
                "accepted": accepted,
                "rejected": rejected,
                "cached_replayed": cached_replayed,
                "cached_suppressed": cached_suppressed,
                "exit_code": return_code,
            }
            if return_code != 0:
                fail_soft = env_enabled(module.env.get("AEGIS_PROVIDER_FAIL_SOFT"))
                message = (
                    f"provider {module.name} exited {return_code}; "
                    f"stderr: {stderr_path}"
                )
                if fail_soft:
                    print(f"[categories] WARNING: {message}", file=sys.stderr)
                else:
                    raise RuntimeError(message)
    finally:
        sink.close()
        evidence.close()
        cache.close()
    return stats


def collect_category_rows(
    temp_dir: Path,
    allowed: set[tuple[str, str]] | None = None,
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    unsorted_dir = temp_dir / "unsorted"
    for kind_dir, public_kind in (("domains", "domain"), ("ips", "ipv4")):
        root = unsorted_dir / kind_dir
        if not root.is_dir():
            continue
        for path in sorted(root.glob("*.txt")):
            category = path.stem
            seen = set()
            with path.open("r", encoding="utf-8") as fh:
                for raw in fh:
                    entry = raw.strip()
                    if not entry or entry in seen:
                        continue
                    if allowed is not None and (public_kind, entry) not in allowed:
                        continue
                    seen.add(entry)
                    rows.append({"kind": public_kind, "entry": entry, "category": category})
    return sorted(rows, key=lambda row: (row["kind"], row["entry"], row["category"]))


def classify_indicators(
    repo_root: Path,
    indicators: Iterable[str],
    generated_at: str | None = None,
) -> list[dict[str, str]]:
    repo_root = repo_root.resolve()
    generated_at = generated_at or utc_now()
    temp_dir = repo_root / "var" / "tmp" / "block-categories-classify"
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
    temp_dir.mkdir(parents=True, exist_ok=True)

    tlds = load_or_fetch_iana_tlds(repo_root / "var" / "state" / "iana-tlds.txt")
    normalized = []
    seen = set()
    for value in indicators:
        item = normalize_indicator(value, tlds)
        if item is None or item in seen:
            continue
        seen.add(item)
        normalized.append(item)

    corpus = temp_dir / "specific-indicators.tsv"
    with corpus.open("w", encoding="utf-8") as out:
        for kind, entry in normalized:
            out.write(f"{kind}\t{entry}\n")

    log_stamp = generated_at.replace(":", "").replace("-", "").replace("T", "-").replace("Z", "")
    log_dir = repo_root / "var" / "logs" / "categories-classify" / log_stamp
    modules = discover_provider_modules(repo_root)
    run_provider_modules(
        repo_root,
        modules,
        corpus,
        temp_dir,
        log_dir,
        generated_at,
        mode="targeted",
    )
    return collect_category_rows(temp_dir, allowed=set(normalized))


def enqueue_indicators(
    repo_root: Path,
    indicators: Iterable[str],
    providers: Iterable[str] | None = None,
    reason: str = "manual",
    priority: int = 100,
    generated_at: str | None = None,
) -> int:
    repo_root = repo_root.resolve()
    generated_at = generated_at or utc_now()
    tlds = load_or_fetch_iana_tlds(repo_root / "var" / "state" / "iana-tlds.txt")
    normalized = []
    seen = set()
    for value in indicators:
        item = normalize_indicator(value, tlds)
        if item is None or item in seen:
            continue
        seen.add(item)
        normalized.append(item)

    modules = discover_provider_modules(repo_root)
    module_by_name = {module.name: module for module in modules}
    explicit_providers = [provider for provider in (providers or []) if provider]
    if explicit_providers:
        provider_names = explicit_providers
    else:
        provider_names = [
            module.name
            for module in modules
            if provider_input_scope(module) == "queue"
        ]

    cache = ClassificationCache(repo_root / "var" / "state" / "classification-cache.sqlite3")
    queued = 0
    try:
        for provider_name in provider_names:
            module = module_by_name.get(provider_name)
            allowed_kinds = provider_allowed_kinds(module) if module is not None else {"domain", "ipv4"}
            for kind, entry in normalized:
                if kind not in allowed_kinds:
                    continue
                cache.enqueue_candidate(
                    provider=provider_name,
                    kind=kind,
                    entry=entry,
                    reason=reason,
                    priority=priority,
                    available_at=generated_at,
                )
                queued += 1
    finally:
        cache.close()
    return queued


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sort_unique(input_path: Path, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["LC_ALL"] = "C"
    subprocess.run(["sort", "-u", str(input_path), "-o", str(output_path)], check=True, env=env)


def filter_sorted_entries(sorted_entries: Path, allowed_entries: Path, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["LC_ALL"] = "C"
    with output_path.open("w", encoding="utf-8") as out:
        subprocess.run(
            ["comm", "-12", str(allowed_entries), str(sorted_entries)],
            check=True,
            stdout=out,
            env=env,
        )


def write_conflict_log(evidence_path: Path, log_dir: Path) -> int:
    if not evidence_path.exists() or evidence_path.stat().st_size == 0:
        return 0

    log_dir.mkdir(parents=True, exist_ok=True)
    sorted_path = evidence_path.with_suffix(".sorted.tsv")
    env = os.environ.copy()
    env["LC_ALL"] = "C"
    subprocess.run(
        ["sort", "-t", "\t", "-k2,2", "-k3,3", str(evidence_path), "-o", str(sorted_path)],
        check=True,
        env=env,
    )

    conflict_path = log_dir / "conflicts.tsv"
    conflict_count = 0
    current_key: tuple[str, str] | None = None
    categories: set[str] = set()
    providers: set[str] = set()
    evidence_count = 0

    def flush_group(handle) -> None:
        nonlocal conflict_count
        if current_key is None or len(categories) < 2:
            return
        kind, entry = current_key
        handle.write(
            f"{kind}\t{entry}\t{','.join(sorted(categories))}\t"
            f"{','.join(sorted(providers))}\t{evidence_count}\n"
        )
        conflict_count += 1

    with sorted_path.open("r", encoding="utf-8") as src, conflict_path.open("w", encoding="utf-8") as out:
        out.write("kind\tentry\tcategories\tproviders\tevidence_count\n")
        for raw in src:
            parts = raw.rstrip("\n").split("\t")
            if len(parts) < 4:
                continue
            provider, kind, entry, category = parts[:4]
            key = (kind, entry)
            if current_key is not None and key != current_key:
                flush_group(out)
                categories = set()
                providers = set()
                evidence_count = 0
            current_key = key
            categories.add(category)
            providers.add(provider)
            evidence_count += 1
        flush_group(out)

    if conflict_count == 0:
        conflict_path.unlink(missing_ok=True)
    return conflict_count


def write_chunked_file(
    sorted_entries: Path,
    category: str,
    kind_dir: str,
    output_root: Path,
    max_lines: int,
    max_bytes: int,
) -> list[dict]:
    prefix = "hosts-block" if kind_dir == "domains" else "ips-block"
    out_dir = output_root / kind_dir / category
    out_dir.mkdir(parents=True, exist_ok=True)
    parts: list[dict] = []
    handle = None
    current_path = None
    part_no = 0
    line_count = 0
    byte_count = 0

    def close_part() -> None:
        nonlocal handle, current_path, line_count, byte_count
        if handle is None or current_path is None:
            return
        handle.close()
        parts.append({
            "category": category,
            "kind": kind_dir,
            "name": current_path.name,
            "url": (
                f"{REPO_BASE_URL}/public_block_categories_lists/"
                f"{kind_dir}/{category}/{current_path.name}"
            ),
            "lines": line_count,
            "bytes": current_path.stat().st_size,
            "sha256": sha256_of(current_path),
        })
        handle = None
        current_path = None
        line_count = 0
        byte_count = 0

    with sorted_entries.open("r", encoding="utf-8") as src:
        for raw in src:
            if not raw.strip():
                continue
            encoded = raw.encode("utf-8")
            if handle is not None and (
                line_count + 1 > max_lines or byte_count + len(encoded) > max_bytes
            ):
                close_part()
                part_no += 1
            if handle is None:
                current_path = out_dir / f"{prefix}-{category}-part{part_no}.txt"
                handle = current_path.open("w", encoding="utf-8")
            handle.write(raw)
            line_count += 1
            byte_count += len(encoded)
    close_part()
    return parts


def write_category_outputs(
    repo_root: Path,
    temp_dir: Path,
    filters: dict[str, Path],
    max_lines: int,
    max_bytes: int,
    generated_at: str,
    provider_stats: dict[str, dict[str, int]],
    conflict_count: int,
) -> dict:
    output_root = repo_root / "public_block_categories_lists"
    if output_root.exists():
        shutil.rmtree(output_root)
    output_root.mkdir(parents=True, exist_ok=True)

    parts: list[dict] = []
    sorted_dir = temp_dir / "sorted"
    unsorted_dir = temp_dir / "unsorted"
    for kind_dir in ("domains", "ips"):
        kind_unsorted = unsorted_dir / kind_dir
        if not kind_unsorted.is_dir():
            continue
        for input_path in sorted(kind_unsorted.glob("*.txt")):
            category = input_path.stem
            sorted_path = sorted_dir / kind_dir / input_path.name
            filtered_path = sorted_dir / kind_dir / f"filtered-{input_path.name}"
            sort_unique(input_path, sorted_path)
            filter_sorted_entries(sorted_path, filters[kind_dir], filtered_path)
            if not filtered_path.exists() or filtered_path.stat().st_size == 0:
                continue
            parts.extend(
                write_chunked_file(
                    filtered_path, category, kind_dir, output_root, max_lines, max_bytes
                )
            )

    categories = []
    for category in sorted({part["category"] for part in parts}):
        category_parts = [part for part in parts if part["category"] == category]
        domains_lines = sum(part["lines"] for part in category_parts if part["kind"] == "domains")
        ips_lines = sum(part["lines"] for part in category_parts if part["kind"] == "ips")
        categories.append({
            "name": category,
            "total_lines": domains_lines + ips_lines,
            "domains_lines": domains_lines,
            "ips_lines": ips_lines,
            "parts": [
                {"kind": part["kind"], "name": part["name"], "url": part["url"]}
                for part in category_parts
            ],
        })

    manifest = {
        "schema_version": 1,
        "generated_at": generated_at,
        "type": "block",
        "scope": "categories",
        "total_lines": sum(part["lines"] for part in parts),
        "category_count": len(categories),
        "conflict_count": conflict_count,
        "provider_modules": provider_stats,
        "categories": categories,
        "parts": parts,
    }
    manifest_path = output_root / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_category_lists(
    repo_root: Path,
    max_lines: int | None = None,
    max_bytes: int | None = None,
    generated_at: str | None = None,
) -> dict:
    repo_root = repo_root.resolve()
    max_lines = max_lines or int(os.environ.get("CATEGORY_MAX_LINES", DEFAULT_MAX_LINES))
    max_bytes = max_bytes or int(os.environ.get("CATEGORY_MAX_BYTES", DEFAULT_MAX_BYTES))
    generated_at = generated_at or utc_now()

    temp_dir = repo_root / "var" / "tmp" / "block-categories"
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
    temp_dir.mkdir(parents=True, exist_ok=True)

    log_stamp = generated_at.replace(":", "").replace("-", "").replace("T", "-").replace("Z", "")
    log_dir = repo_root / "var" / "logs" / "categories" / log_stamp

    corpus = temp_dir / "block-corpus.tsv"
    corpus_info = write_block_corpus(repo_root, corpus, temp_dir)
    corpus_counts = corpus_info.counts
    modules = discover_provider_modules(repo_root)
    print(
        "[categories] corpus: "
        f"{corpus_counts['domain']} domains, {corpus_counts['ipv4']} IPv4, "
        f"{corpus_counts['rejected']} rejected"
    )
    print(f"[categories] provider modules: {', '.join(m.name for m in modules) or '(none)'}")

    provider_stats = run_provider_modules(
        repo_root,
        modules,
        corpus,
        temp_dir,
        log_dir,
        generated_at,
        mode="build",
    )
    conflict_count = write_conflict_log(temp_dir / "evidence.tsv", log_dir)
    manifest = write_category_outputs(
        repo_root,
        temp_dir,
        {
            "domains": corpus_info.domains_filter,
            "ips": corpus_info.ips_filter,
        },
        max_lines,
        max_bytes,
        generated_at,
        provider_stats,
        conflict_count,
    )
    print(
        f"[categories] wrote {manifest['category_count']} categories, "
        f"{len(manifest['parts'])} part(s), {manifest['total_lines']} total lines"
    )
    return manifest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--max-lines", type=int, default=None)
    parser.add_argument("--max-bytes", type=int, default=None)
    parser.add_argument(
        "--classify",
        action="append",
        default=[],
        metavar="DOMAIN_OR_URL_OR_IP",
        help="Classify one specific domain, URL, or IPv4 without publishing category files.",
    )
    parser.add_argument(
        "--classify-file",
        action="append",
        default=[],
        type=Path,
        help="Read specific domains, URLs, or IPv4s to classify, one per line.",
    )
    parser.add_argument(
        "--enqueue",
        action="append",
        default=[],
        metavar="DOMAIN_OR_URL_OR_IP",
        help="Queue one specific domain, URL, or IPv4 for bounded live-provider lookup.",
    )
    parser.add_argument(
        "--enqueue-file",
        action="append",
        default=[],
        type=Path,
        help="Read domains, URLs, or IPv4s to queue for bounded live-provider lookup.",
    )
    parser.add_argument(
        "--enqueue-provider",
        action="append",
        default=[],
        metavar="PROVIDER",
        help="Provider queue to target. Defaults to discovered queue-scope providers.",
    )
    parser.add_argument("--enqueue-reason", default="manual")
    parser.add_argument("--enqueue-priority", type=int, default=100)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    queued_indicators = list(args.enqueue)
    for path in args.enqueue_file:
        with path.open("r", encoding="utf-8", errors="ignore") as fh:
            queued_indicators.extend(line.strip() for line in fh if line.strip())

    if queued_indicators:
        queued = enqueue_indicators(
            args.repo_root,
            queued_indicators,
            providers=args.enqueue_provider,
            reason=args.enqueue_reason,
            priority=args.enqueue_priority,
        )
        print(f"[categories] queued {queued} provider candidate(s)")
        return 0

    indicators = list(args.classify)
    for path in args.classify_file:
        with path.open("r", encoding="utf-8", errors="ignore") as fh:
            indicators.extend(line.strip() for line in fh if line.strip())

    if indicators:
        for row in classify_indicators(args.repo_root, indicators):
            print(f"{row['kind']}\t{row['entry']}\t{row['category']}")
        return 0

    build_category_lists(args.repo_root, args.max_lines, args.max_bytes)
    return 0


if __name__ == "__main__":
    sys.exit(main())
