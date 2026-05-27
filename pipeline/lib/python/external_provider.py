"""Shared helpers for fail-soft external classification provider adapters."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Iterable


class ProviderRequestError(RuntimeError):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, str(default)))
    except ValueError:
        return default


def iter_input_rows(path: Path, allowed_kinds: set[str] | None = None):
    with path.open("r", encoding="utf-8", errors="ignore") as fh:
        for raw in fh:
            row = raw.rstrip("\n").split("\t", 1)
            if len(row) != 2:
                continue
            kind, entry = row[0].strip(), row[1].strip()
            if not kind or not entry:
                continue
            if allowed_kinds is not None and kind not in allowed_kinds:
                continue
            yield kind, entry


def emit(kind: str, entry: str, category: str, confidence: str = "", evidence: str = "") -> None:
    fields = [kind, entry, category, confidence, evidence]
    print("\t".join(sanitize_field(field) for field in fields))


def sanitize_field(value: object) -> str:
    return str(value).replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()


def slug_category(value: object) -> str:
    text = sanitize_field(value).lower()
    output = []
    last_dash = False
    for char in text:
        if char.isalnum():
            output.append(char)
            last_dash = False
        elif not last_dash:
            output.append("-")
            last_dash = True
    return "".join(output).strip("-")


def compact_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def http_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    form: dict[str, str] | None = None,
    body: object | None = None,
    timeout: int = 30,
    accepted_statuses: Iterable[int] = (200,),
) -> tuple[int, object]:
    request_headers = dict(headers or {})
    data = None
    if form is not None:
        data = urllib.parse.urlencode(form).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
    elif body is not None:
        data = json.dumps(body).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")

    request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
    accepted = set(accepted_statuses)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status = response.getcode()
            raw = response.read()
    except urllib.error.HTTPError as exc:
        status = exc.code
        raw = exc.read()
        if status not in accepted:
            raise ProviderRequestError(f"HTTP {status} from {url}", status)
    except Exception as exc:
        raise ProviderRequestError(f"{type(exc).__name__}: {exc}") from exc

    if status not in accepted:
        raise ProviderRequestError(f"HTTP {status} from {url}", status)
    if not raw:
        return status, {}
    try:
        return status, json.loads(raw.decode("utf-8", errors="replace"))
    except json.JSONDecodeError as exc:
        raise ProviderRequestError(f"invalid JSON from {url}: {exc}") from exc


def sleep_between_requests() -> None:
    delay = env_float("AEGIS_PROVIDER_REQUEST_DELAY_SECONDS", 0.0)
    if delay > 0:
        time.sleep(delay)


def provider_main(run_lookup) -> int:
    input_path = Path(os.environ["AEGIS_CATEGORY_INPUT"])
    had_operational_error = False
    for kind, entry in iter_input_rows(input_path):
        try:
            run_lookup(kind, entry)
        except ProviderRequestError as exc:
            had_operational_error = True
            print(f"[external-provider] {kind} {entry}: {exc}", file=sys.stderr)
        except Exception as exc:
            had_operational_error = True
            print(
                f"[external-provider] {kind} {entry}: {type(exc).__name__}: {exc}",
                file=sys.stderr,
            )
        sleep_between_requests()
    return 75 if had_operational_error else 0
