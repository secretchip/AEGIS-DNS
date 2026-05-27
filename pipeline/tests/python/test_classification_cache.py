"""Tests for classification cache and queue behavior."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from pipeline.lib.python.classification_cache import ClassificationCache


class ClassificationCacheTests(unittest.TestCase):
    def test_unexpired_positive_results_are_replayed_until_ttl_expires(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = ClassificationCache(Path(tmp) / "classification-cache.sqlite3")
            cache.upsert_result(
                provider="fixture",
                kind="domain",
                entry="malware.example.com",
                status="hit",
                categories=["malware"],
                confidence="high",
                evidence="fixture evidence",
                fetched_at="2026-05-20T00:00:00Z",
                expires_at="2026-08-18T00:00:00Z",
                provider_version="1",
            )

            rows = list(cache.iter_unexpired_positive(provider="fixture", now="2026-06-01T00:00:00Z"))
            expired = list(cache.iter_unexpired_positive(provider="fixture", now="2026-09-01T00:00:00Z"))

            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["categories"], ["malware"])
            self.assertEqual(expired, [])

    def test_queue_returns_due_candidates_by_priority_and_marks_attempts(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = ClassificationCache(Path(tmp) / "classification-cache.sqlite3")
            cache.enqueue_candidate(
                provider="fixture",
                kind="domain",
                entry="later.example.com",
                reason="test",
                priority=10,
                available_at="2026-05-21T00:00:00Z",
            )
            cache.enqueue_candidate(
                provider="fixture",
                kind="domain",
                entry="now.example.com",
                reason="test",
                priority=100,
                available_at="2026-05-20T00:00:00Z",
            )

            due = list(cache.iter_due_queue(provider="fixture", limit=10, now="2026-05-20T12:00:00Z"))
            cache.mark_queue_attempt("fixture", "domain", "now.example.com", "2026-05-20T12:00:00Z")
            after_attempt = list(cache.iter_due_queue(provider="fixture", limit=10, now="2026-05-20T12:00:00Z"))

            self.assertEqual([row["entry"] for row in due], ["now.example.com"])
            self.assertEqual(after_attempt, [])


if __name__ == "__main__":
    unittest.main()
