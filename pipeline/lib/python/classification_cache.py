"""SQLite cache and queue helpers for classification provider lookups."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable


ISO_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime(ISO_FORMAT)


def parse_iso(value: str) -> datetime:
    normalized = value.strip().replace("+00:00", "Z")
    if normalized.endswith("Z"):
        return datetime.strptime(normalized, ISO_FORMAT).replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(normalized).astimezone(timezone.utc)


def add_days(value: str, days: int) -> str:
    return (parse_iso(value) + timedelta(days=days)).strftime(ISO_FORMAT)


class ClassificationCache:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path))
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS classification_results (
              provider TEXT NOT NULL,
              kind TEXT NOT NULL,
              entry TEXT NOT NULL,
              status TEXT NOT NULL,
              categories_json TEXT NOT NULL DEFAULT '[]',
              confidence TEXT NOT NULL DEFAULT '',
              evidence TEXT NOT NULL DEFAULT '',
              fetched_at TEXT NOT NULL,
              expires_at TEXT NOT NULL,
              provider_version TEXT NOT NULL DEFAULT '',
              PRIMARY KEY (provider, kind, entry)
            );

            CREATE TABLE IF NOT EXISTS classification_queue (
              provider TEXT NOT NULL,
              kind TEXT NOT NULL,
              entry TEXT NOT NULL,
              reason TEXT NOT NULL DEFAULT '',
              priority INTEGER NOT NULL DEFAULT 0,
              available_at TEXT NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0,
              last_attempt_at TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL,
              PRIMARY KEY (provider, kind, entry)
            );
            """
        )
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def upsert_result(
        self,
        *,
        provider: str,
        kind: str,
        entry: str,
        status: str,
        categories: Iterable[str],
        confidence: str,
        evidence: str,
        fetched_at: str,
        expires_at: str,
        provider_version: str,
    ) -> None:
        categories_json = json.dumps(sorted(set(categories)))
        self.conn.execute(
            """
            INSERT INTO classification_results (
              provider, kind, entry, status, categories_json, confidence,
              evidence, fetched_at, expires_at, provider_version
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(provider, kind, entry) DO UPDATE SET
              status=excluded.status,
              categories_json=excluded.categories_json,
              confidence=excluded.confidence,
              evidence=excluded.evidence,
              fetched_at=excluded.fetched_at,
              expires_at=excluded.expires_at,
              provider_version=excluded.provider_version
            """,
            (
                provider,
                kind,
                entry,
                status,
                categories_json,
                confidence,
                evidence,
                fetched_at,
                expires_at,
                provider_version,
            ),
        )
        self.conn.commit()

    def lookup(
        self,
        provider: str,
        kind: str,
        entry: str,
        *,
        provider_version: str = "",
        now: str | None = None,
    ) -> dict | None:
        now = now or utc_now_iso()
        row = self.conn.execute(
            """
            SELECT * FROM classification_results
            WHERE provider=? AND kind=? AND entry=? AND expires_at > ?
            """,
            (provider, kind, entry, now),
        ).fetchone()
        if row is None:
            return None
        if provider_version and row["provider_version"] != provider_version:
            return None
        return self._row_to_result(row)

    def iter_unexpired_positive(
        self,
        *,
        provider: str | None = None,
        now: str | None = None,
    ):
        now = now or utc_now_iso()
        if provider:
            rows = self.conn.execute(
                """
                SELECT * FROM classification_results
                WHERE provider=? AND status='hit' AND expires_at > ?
                ORDER BY kind, entry
                """,
                (provider, now),
            )
        else:
            rows = self.conn.execute(
                """
                SELECT * FROM classification_results
                WHERE status='hit' AND expires_at > ?
                ORDER BY provider, kind, entry
                """,
                (now,),
            )
        for row in rows:
            result = self._row_to_result(row)
            if result["categories"]:
                yield result

    def enqueue_candidate(
        self,
        *,
        provider: str,
        kind: str,
        entry: str,
        reason: str,
        priority: int,
        available_at: str,
    ) -> None:
        created_at = utc_now_iso()
        self.conn.execute(
            """
            INSERT INTO classification_queue (
              provider, kind, entry, reason, priority, available_at, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(provider, kind, entry) DO UPDATE SET
              reason=excluded.reason,
              priority=max(classification_queue.priority, excluded.priority),
              available_at=excluded.available_at,
              last_attempt_at=''
            """,
            (provider, kind, entry, reason, priority, available_at, created_at),
        )
        self.conn.commit()

    def iter_due_queue(self, *, provider: str, limit: int, now: str | None = None):
        now = now or utc_now_iso()
        rows = self.conn.execute(
            """
            SELECT provider, kind, entry, reason, priority, available_at, attempts
            FROM classification_queue
            WHERE provider=? AND available_at <= ? AND last_attempt_at=''
            ORDER BY priority DESC, available_at ASC, entry ASC
            LIMIT ?
            """,
            (provider, now, limit),
        )
        for row in rows:
            yield dict(row)

    def mark_queue_attempt(self, provider: str, kind: str, entry: str, attempted_at: str) -> None:
        self.conn.execute(
            """
            UPDATE classification_queue
            SET attempts=attempts + 1, last_attempt_at=?
            WHERE provider=? AND kind=? AND entry=?
            """,
            (attempted_at, provider, kind, entry),
        )
        self.conn.commit()

    def delete_queue_candidate(self, provider: str, kind: str, entry: str) -> None:
        self.conn.execute(
            """
            DELETE FROM classification_queue
            WHERE provider=? AND kind=? AND entry=?
            """,
            (provider, kind, entry),
        )
        self.conn.commit()

    @staticmethod
    def _row_to_result(row: sqlite3.Row) -> dict:
        return {
            "provider": row["provider"],
            "kind": row["kind"],
            "entry": row["entry"],
            "status": row["status"],
            "categories": json.loads(row["categories_json"] or "[]"),
            "confidence": row["confidence"],
            "evidence": row["evidence"],
            "fetched_at": row["fetched_at"],
            "expires_at": row["expires_at"],
            "provider_version": row["provider_version"],
        }
