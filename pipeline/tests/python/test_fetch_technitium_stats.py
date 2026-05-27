"""Tests for the standalone Technitium stats collector."""
from __future__ import annotations

import importlib.util
import os
import socket
import tempfile
import textwrap
import unittest
import urllib.parse
from unittest import mock
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = REPO_ROOT / "tools" / "fetch-technitium-stats.py"


def load_stats_script():
    if not SCRIPT_PATH.exists():
        raise AssertionError(f"missing stats script at {SCRIPT_PATH}")
    spec = importlib.util.spec_from_file_location("fetch_technitium_stats", SCRIPT_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TechnitiumStatsScriptTests(unittest.TestCase):
    def test_load_env_file_parses_values_without_overriding_existing_env(self):
        script = load_stats_script()
        with tempfile.TemporaryDirectory() as tmp:
            env_path = Path(tmp) / "aegis-dns.env"
            env_path.write_text(
                textwrap.dedent(
                    """\
                    TECHNITIUM_HOST="https://dns.example:53444"
                    TECHNITIUM_API_TOKEN='file-token'
                    TECHNITIUM_INSECURE_SSL=true
                    """
                ),
                encoding="utf-8",
            )
            env = {"TECHNITIUM_API_TOKEN": "shell-token"}

            script.load_env_file(env_path, env)

            self.assertEqual(env["TECHNITIUM_HOST"], "https://dns.example:53444")
            self.assertEqual(env["TECHNITIUM_API_TOKEN"], "shell-token")
            self.assertEqual(env["TECHNITIUM_INSECURE_SSL"], "true")

    def test_extract_stats_accepts_technitium_response_wrapper(self):
        script = load_stats_script()

        stats = script.extract_stats(
            {
                "status": "ok",
                "response": {
                    "stats": {
                        "totalQueries": 100,
                        "totalBlocked": 20,
                    },
                    "topClients": [{"name": "192.0.2.10"}],
                },
            }
        )

        self.assertEqual(stats, {"totalQueries": 100, "totalBlocked": 20})

    def test_format_report_omits_sensitive_top_tables(self):
        script = load_stats_script()

        report = script.format_report(
            generated_at="2026-05-21T00:00:00Z",
            host="https://dns.example:53444",
            ranges=[
                script.RangeResult(
                    name="LastDay",
                    ok=True,
                    stats={
                        "totalQueries": 100,
                        "totalBlocked": 20,
                        "topClients": ["should-not-appear"],
                        "topDomains": ["should-not-appear"],
                    },
                    error="",
                )
            ],
        )

        self.assertIn("[LastDay]", report)
        self.assertIn("totalQueries=100", report)
        self.assertIn("totalBlocked=20", report)
        self.assertNotIn("topClients", report)
        self.assertNotIn("should-not-appear", report)

    def test_fetch_range_stats_calls_dashboard_endpoint(self):
        script = load_stats_script()
        captured = {}

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, traceback):
                return False

            def read(self):
                return b'{"status":"ok","response":{"stats":{"totalQueries":7}}}'

        def fake_urlopen(request, timeout, context):
            captured["url"] = request.full_url
            captured["timeout"] = timeout
            captured["context"] = context
            return FakeResponse()

        with mock.patch.object(script.urllib.request, "urlopen", fake_urlopen):
            stats = script.fetch_range_stats(
                host="https://dns.example:53444",
                token="secret-token",
                range_name="LastDay",
                insecure=False,
                timeout=15,
            )

        parsed = urllib.parse.urlparse(captured["url"])
        query = urllib.parse.parse_qs(parsed.query)

        self.assertEqual(parsed.path, "/api/dashboard/stats/get")
        self.assertEqual(query["token"], ["secret-token"])
        self.assertEqual(query["type"], ["LastDay"])
        self.assertEqual(query["utc"], ["true"])
        self.assertEqual(captured["timeout"], 15)
        self.assertIsNone(captured["context"])
        self.assertEqual(stats, {"totalQueries": 7})

    def test_main_fails_before_fetch_when_host_cannot_resolve(self):
        script = load_stats_script()

        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            env_path = repo_root / "var" / "secrets" / "aegis-dns.env"
            env_path.parent.mkdir(parents=True)
            env_path.write_text(
                textwrap.dedent(
                    """\
                    TECHNITIUM_HOST='https://missing.example:53444'
                    TECHNITIUM_API_TOKEN='secret-token'
                    """
                ),
                encoding="utf-8",
            )
            output = repo_root / "public_dns_statistics" / "stats.txt"

            with mock.patch.dict(os.environ, {}, clear=True):
                with mock.patch.object(
                    script.socket,
                    "getaddrinfo",
                    side_effect=socket.gaierror(-2, "Name or service not known"),
                ):
                    with mock.patch.object(
                        script,
                        "fetch_range_stats",
                        side_effect=AssertionError("fetch should not be called"),
                    ):
                        exit_code = script.main(
                            [
                                "--repo-root",
                                str(repo_root),
                                "--range",
                                "LastDay",
                            ]
                        )

            self.assertEqual(exit_code, 1)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
