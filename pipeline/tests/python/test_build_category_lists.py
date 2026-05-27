"""Tests for block category list generation."""
from __future__ import annotations

import importlib.util
import os
import shutil
import tempfile
import textwrap
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
MODULE_PATH = REPO_ROOT / "pipeline" / "build-category-lists.py"


def load_builder():
    if not MODULE_PATH.exists():
        raise AssertionError(f"missing category builder at {MODULE_PATH}")
    spec = importlib.util.spec_from_file_location("build_category_lists", MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CategoryBuilderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name)
        (self.repo / "var" / "state").mkdir(parents=True)
        (self.repo / "var" / "state" / "iana-tlds.txt").write_text(
            "COM\nNET\nORG\n", encoding="utf-8"
        )
        (self.repo / "public_block_lists" / "domains").mkdir(parents=True)
        (self.repo / "public_block_lists" / "ips").mkdir(parents=True)
        (self.repo / "pipeline" / "providers" / "fixture").mkdir(parents=True)
        lib_dir = self.repo / "pipeline" / "lib" / "python"
        lib_dir.mkdir(parents=True)
        shutil.copy2(REPO_ROOT / "pipeline" / "lib" / "python" / "validate.py", lib_dir / "validate.py")
        shutil.copy2(
            REPO_ROOT / "pipeline" / "lib" / "python" / "classification_cache.py",
            lib_dir / "classification_cache.py",
        )

    def tearDown(self):
        self.tmp.cleanup()

    def write_public_blocks(self):
        (self.repo / "public_block_lists" / "domains" / "hosts-block-part0.txt").write_text(
            textwrap.dedent(
                """\
                # generated header
                ads.example.com
                shared.example.com
                malware.example.com
                other.example.com
                """
            ),
            encoding="utf-8",
        )
        (self.repo / "public_block_lists" / "ips" / "ips-block-part0.txt").write_text(
            "1.2.3.4\n5.6.7.8\n", encoding="utf-8"
        )

    def write_fixture_provider(self):
        provider = self.repo / "pipeline" / "providers" / "fixture"
        (provider / "module.env.template").write_text(
            "AEGIS_PROVIDER_ENABLED=true\nAEGIS_PROVIDER_REQUIRED_ENV=\n",
            encoding="utf-8",
        )
        (provider / "adapter.py").write_text(
            textwrap.dedent(
                """\
                from __future__ import annotations

                import os
                from pathlib import Path

                rows = {
                    ("domain", "ads.example.com"): ["Ads & Tracking"],
                    ("domain", "shared.example.com"): ["Ads & Tracking", "Malware", "Malware"],
                    ("domain", "malware.example.com"): ["Malware"],
                    ("domain", "other.example.com"): ["###"],
                    ("ipv4", "1.2.3.4"): ["Malware"],
                }

                with Path(os.environ["AEGIS_CATEGORY_INPUT"]).open(encoding="utf-8") as fh:
                    for raw in fh:
                        kind, entry = raw.rstrip("\\n").split("\\t", 1)
                        for category in rows.get((kind, entry), []):
                            print(f"{kind}\\t{entry}\\t{category}")
                """
            ),
            encoding="utf-8",
        )

    def copy_production_provider(self, name: str):
        source = REPO_ROOT / "pipeline" / "providers" / name
        if not source.is_dir():
            raise AssertionError(f"missing production provider at {source}")
        target = self.repo / "pipeline" / "providers" / name
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target)

    def test_builds_category_outputs_from_final_public_block_lists(self):
        self.write_public_blocks()
        self.write_fixture_provider()
        builder = load_builder()

        manifest = builder.build_category_lists(
            self.repo,
            max_lines=2,
            max_bytes=10_000,
            generated_at="2026-05-20T00:00:00Z",
        )

        ads_part = (
            self.repo
            / "public_block_categories_lists"
            / "domains"
            / "ads-tracking"
            / "hosts-block-ads-tracking-part0.txt"
        )
        malware_domain_part0 = (
            self.repo
            / "public_block_categories_lists"
            / "domains"
            / "malware"
            / "hosts-block-malware-part0.txt"
        )
        malware_domain_part1 = (
            self.repo
            / "public_block_categories_lists"
            / "domains"
            / "malware"
            / "hosts-block-malware-part1.txt"
        )
        malware_ip_part = (
            self.repo
            / "public_block_categories_lists"
            / "ips"
            / "malware"
            / "ips-block-malware-part0.txt"
        )

        self.assertEqual(
            ads_part.read_text(encoding="utf-8").splitlines(),
            ["ads.example.com", "shared.example.com"],
        )
        self.assertEqual(
            malware_domain_part0.read_text(encoding="utf-8").splitlines(),
            ["malware.example.com", "shared.example.com"],
        )
        self.assertFalse(malware_domain_part1.exists())
        self.assertEqual(malware_ip_part.read_text(encoding="utf-8"), "1.2.3.4\n")
        self.assertEqual([c["name"] for c in manifest["categories"]], ["ads-tracking", "malware"])
        self.assertEqual(manifest["total_lines"], 5)
        self.assertTrue((self.repo / "public_block_categories_lists" / "manifest.json").exists())

    def test_provider_rows_are_filtered_to_final_public_block_lists(self):
        self.write_public_blocks()
        provider = self.repo / "pipeline" / "providers" / "fixture"
        (provider / "module.env.template").write_text(
            "AEGIS_PROVIDER_ENABLED=true\nAEGIS_PROVIDER_REQUIRED_ENV=\n",
            encoding="utf-8",
        )
        (provider / "adapter.py").write_text(
            textwrap.dedent(
                """\
                print("domain\\tads.example.com\\tAds")
                print("domain\\tnot-final-blocked.example.com\\tAds")
                print("ipv4\\t9.9.9.9\\tMalware")
                """
            ),
            encoding="utf-8",
        )
        builder = load_builder()

        manifest = builder.build_category_lists(
            self.repo,
            max_lines=100,
            max_bytes=10_000,
            generated_at="2026-05-20T00:00:00Z",
        )

        ads_part = (
            self.repo
            / "public_block_categories_lists"
            / "domains"
            / "ads"
            / "hosts-block-ads-part0.txt"
        )
        self.assertEqual(ads_part.read_text(encoding="utf-8"), "ads.example.com\n")
        self.assertEqual(manifest["total_lines"], 1)

    def test_category_aliases_and_conflict_log_preserve_union_categories(self):
        self.write_public_blocks()
        self.write_fixture_provider()
        (self.repo / "sources").mkdir(exist_ok=True)
        (self.repo / "sources" / "category_aliases.tsv").write_text(
            "ads-tracking\tads\n", encoding="utf-8"
        )
        builder = load_builder()

        manifest = builder.build_category_lists(
            self.repo,
            max_lines=100,
            max_bytes=10_000,
            generated_at="2026-05-20T00:00:00Z",
        )

        ads_part = (
            self.repo
            / "public_block_categories_lists"
            / "domains"
            / "ads"
            / "hosts-block-ads-part0.txt"
        )
        malware_part = (
            self.repo
            / "public_block_categories_lists"
            / "domains"
            / "malware"
            / "hosts-block-malware-part0.txt"
        )
        conflict_log = (
            self.repo
            / "var"
            / "logs"
            / "categories"
            / "20260520-000000"
            / "conflicts.tsv"
        )

        self.assertEqual(ads_part.read_text(encoding="utf-8").splitlines(), ["ads.example.com", "shared.example.com"])
        self.assertIn("shared.example.com", malware_part.read_text(encoding="utf-8"))
        self.assertTrue(conflict_log.exists())
        self.assertIn("shared.example.com", conflict_log.read_text(encoding="utf-8"))
        self.assertEqual([c["name"] for c in manifest["categories"]], ["ads", "malware"])

    def test_source_provenance_provider_classifies_from_source_registry(self):
        (self.repo / "public_block_lists" / "domains" / "hosts-block-part0.txt").write_text(
            "phish.example.com\n", encoding="utf-8"
        )
        (self.repo / "public_block_lists" / "ips" / "ips-block-part0.txt").write_text(
            "", encoding="utf-8"
        )
        provenance_dir = self.repo / "var" / "intake" / "block" / "provenance" / "current"
        provenance_dir.mkdir(parents=True)
        (provenance_dir / "source-001-domains.txt").write_text(
            "phish.example.com\nremoved.example.com\n", encoding="utf-8"
        )
        (provenance_dir / "source-001-ips.txt").write_text("", encoding="utf-8")
        (provenance_dir / "manifest.tsv").write_text(
            "\t".join(
                [
                    "source_id",
                    "type",
                    "source_url",
                    "input_file",
                    "domains_file",
                    "ips_file",
                    "domains_count",
                    "ips_count",
                    "downloaded_at",
                    "status",
                ]
            )
            + "\n"
            + "source-001\tblock\thttps://openphish.example/feed.txt\tinput-block-automated-1.txt\tsource-001-domains.txt\tsource-001-ips.txt\t2\t0\t2026-05-20T00:00:00Z\tsuccess\n",
            encoding="utf-8",
        )
        (self.repo / "sources").mkdir(exist_ok=True)
        (self.repo / "sources" / "block_source_categories.tsv").write_text(
            "exact\thttps://openphish.example/feed.txt\tphishing\n", encoding="utf-8"
        )
        self.copy_production_provider("source-provenance")
        builder = load_builder()

        manifest = builder.build_category_lists(
            self.repo,
            max_lines=100,
            max_bytes=10_000,
            generated_at="2026-05-20T00:00:00Z",
        )

        phish_part = (
            self.repo
            / "public_block_categories_lists"
            / "domains"
            / "phishing"
            / "hosts-block-phishing-part0.txt"
        )
        self.assertEqual(phish_part.read_text(encoding="utf-8"), "phish.example.com\n")
        self.assertEqual(manifest["total_lines"], 1)

    def test_byte_limit_starts_a_new_part_before_threshold_is_exceeded(self):
        self.write_public_blocks()
        self.write_fixture_provider()
        builder = load_builder()

        builder.build_category_lists(
            self.repo,
            max_lines=100,
            max_bytes=len("malware.example.com\n"),
            generated_at="2026-05-20T00:00:00Z",
        )

        malware_dir = self.repo / "public_block_categories_lists" / "domains" / "malware"
        self.assertEqual(
            (malware_dir / "hosts-block-malware-part0.txt").read_text(encoding="utf-8"),
            "malware.example.com\n",
        )
        self.assertEqual(
            (malware_dir / "hosts-block-malware-part1.txt").read_text(encoding="utf-8"),
            "shared.example.com\n",
        )

    def test_provider_discovery_skips_disabled_and_missing_required_config(self):
        builder = load_builder()
        provider_root = self.repo / "pipeline" / "providers"
        (provider_root / "disabled").mkdir()
        (provider_root / "disabled" / "module.env.template").write_text(
            "AEGIS_PROVIDER_ENABLED=false\n", encoding="utf-8"
        )
        (provider_root / "disabled" / "adapter.py").write_text("", encoding="utf-8")
        (provider_root / "missing").mkdir()
        (provider_root / "missing" / "module.env.template").write_text(
            "AEGIS_PROVIDER_ENABLED=true\nAEGIS_PROVIDER_REQUIRED_ENV=API_TOKEN\n",
            encoding="utf-8",
        )
        (provider_root / "missing" / "adapter.py").write_text("", encoding="utf-8")
        (provider_root / "enabled").mkdir()
        (provider_root / "enabled" / "module.env.template").write_text(
            "AEGIS_PROVIDER_ENABLED=true\nAEGIS_PROVIDER_REQUIRED_ENV=\n",
            encoding="utf-8",
        )
        (provider_root / "enabled" / "adapter.py").write_text("", encoding="utf-8")

        modules = builder.discover_provider_modules(self.repo, provider_root)

        self.assertEqual([m.name for m in modules], ["enabled"])

    def test_shell_environment_overrides_provider_env_file(self):
        builder = load_builder()
        provider = self.repo / "pipeline" / "providers" / "fixture"
        (provider / "module.env.template").write_text(
            "AEGIS_PROVIDER_ENABLED=false\n", encoding="utf-8"
        )
        (provider / "adapter.py").write_text("", encoding="utf-8")
        secrets = self.repo / "var" / "secrets" / "providers"
        secrets.mkdir(parents=True)
        (secrets / "fixture.env").write_text("AEGIS_PROVIDER_ENABLED=false\n", encoding="utf-8")

        old = os.environ.get("AEGIS_PROVIDER_ENABLED")
        os.environ["AEGIS_PROVIDER_ENABLED"] = "true"
        try:
            modules = builder.discover_provider_modules(self.repo, self.repo / "pipeline" / "providers")
        finally:
            if old is None:
                os.environ.pop("AEGIS_PROVIDER_ENABLED", None)
            else:
                os.environ["AEGIS_PROVIDER_ENABLED"] = old

        self.assertEqual([m.name for m in modules], ["fixture"])

    def test_classifies_specific_urls_and_ips_without_public_list_filter(self):
        self.write_fixture_provider()
        builder = load_builder()

        rows = builder.classify_indicators(
            self.repo,
            ["https://ads.example.com/path?q=1", "1.2.3.4", "https://outside.example.com/"],
            generated_at="2026-05-20T00:00:00Z",
        )

        self.assertEqual(
            rows,
            [
                {"kind": "domain", "entry": "ads.example.com", "category": "ads-tracking"},
                {"kind": "ipv4", "entry": "1.2.3.4", "category": "malware"},
            ],
        )

    def test_enqueue_indicators_targets_queue_scope_providers(self):
        provider = self.repo / "pipeline" / "providers" / "fixture"
        (provider / "module.env.template").write_text(
            textwrap.dedent(
                """\
                AEGIS_PROVIDER_ENABLED=true
                AEGIS_PROVIDER_REQUIRED_ENV=
                AEGIS_PROVIDER_INPUT_SCOPE=queue
                AEGIS_PROVIDER_CACHE_ENABLED=true
                """
            ),
            encoding="utf-8",
        )
        (provider / "adapter.py").write_text("", encoding="utf-8")
        builder = load_builder()

        queued = builder.enqueue_indicators(
            self.repo,
            ["https://queued.example.com/path", "1.2.3.4"],
            generated_at="2026-05-20T00:00:00Z",
        )
        cache = builder.ClassificationCache(self.repo / "var" / "state" / "classification-cache.sqlite3")
        due = list(cache.iter_due_queue(provider="fixture", limit=10, now="2026-05-20T00:00:00Z"))
        cache.close()

        self.assertEqual(queued, 2)
        self.assertEqual(
            [(row["kind"], row["entry"]) for row in due],
            [("ipv4", "1.2.3.4"), ("domain", "queued.example.com")],
        )

    def test_failed_queue_provider_does_not_cache_misses_or_drop_queue_candidate(self):
        (self.repo / "public_block_lists" / "domains" / "hosts-block-part0.txt").write_text(
            "queued.example.com\n", encoding="utf-8"
        )
        (self.repo / "public_block_lists" / "ips" / "ips-block-part0.txt").write_text(
            "", encoding="utf-8"
        )
        provider = self.repo / "pipeline" / "providers" / "fixture"
        (provider / "module.env.template").write_text(
            textwrap.dedent(
                """\
                AEGIS_PROVIDER_ENABLED=true
                AEGIS_PROVIDER_REQUIRED_ENV=
                AEGIS_PROVIDER_INPUT_SCOPE=queue
                AEGIS_PROVIDER_CACHE_ENABLED=true
                AEGIS_PROVIDER_FAIL_SOFT=true
                """
            ),
            encoding="utf-8",
        )
        (provider / "adapter.py").write_text(
            "import sys\nsys.exit(75)\n",
            encoding="utf-8",
        )
        builder = load_builder()
        builder.enqueue_indicators(
            self.repo,
            ["queued.example.com"],
            providers=["fixture"],
            generated_at="2026-05-20T00:00:00Z",
        )

        builder.build_category_lists(
            self.repo,
            max_lines=100,
            max_bytes=10_000,
            generated_at="2026-05-20T00:00:00Z",
        )

        cache = builder.ClassificationCache(self.repo / "var" / "state" / "classification-cache.sqlite3")
        cached = cache.lookup(
            "fixture",
            "domain",
            "queued.example.com",
            now="2026-05-20T00:00:00Z",
        )
        due = list(cache.iter_due_queue(provider="fixture", limit=10, now="2026-05-20T00:00:00Z"))
        cache.close()

        self.assertIsNone(cached)
        self.assertEqual([(row["kind"], row["entry"]) for row in due], [("domain", "queued.example.com")])

    def test_manual_category_provider_processes_campaign_files(self):
        (self.repo / "public_block_lists" / "domains" / "hosts-block-part0.txt").write_text(
            "campaign.example.com\nshared.example.com\n", encoding="utf-8"
        )
        (self.repo / "public_block_lists" / "ips" / "ips-block-part0.txt").write_text(
            "1.2.3.4\n", encoding="utf-8"
        )
        manual_dir = self.repo / "sources" / "manual-categories"
        manual_dir.mkdir(parents=True)
        (manual_dir / "emotet-2026.txt").write_text(
            textwrap.dedent(
                """\
                category: Emotet 2026
                source: https://research.example/report
                source: internal ticket 123
                entry: https://campaign.example.com/path
                entry: 1.2.3.4
                entry: not-final-blocked.example.com
                """
            ),
            encoding="utf-8",
        )
        self.copy_production_provider("manual-categories")
        builder = load_builder()

        manifest = builder.build_category_lists(
            self.repo,
            max_lines=100,
            max_bytes=10_000,
            generated_at="2026-05-20T00:00:00Z",
        )

        domain_part = (
            self.repo
            / "public_block_categories_lists"
            / "domains"
            / "emotet-2026"
            / "hosts-block-emotet-2026-part0.txt"
        )
        ip_part = (
            self.repo
            / "public_block_categories_lists"
            / "ips"
            / "emotet-2026"
            / "ips-block-emotet-2026-part0.txt"
        )
        self.assertEqual(domain_part.read_text(encoding="utf-8"), "campaign.example.com\n")
        self.assertEqual(ip_part.read_text(encoding="utf-8"), "1.2.3.4\n")
        self.assertEqual(manifest["category_count"], 1)
        self.assertEqual(manifest["total_lines"], 2)


if __name__ == "__main__":
    unittest.main()
