"""Tests for external classification provider modules."""
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
PROVIDER_ROOT = REPO_ROOT / "pipeline" / "providers"
EXTERNAL_PROVIDERS = [
    "urlhaus",
    "threatfox",
    "abuseipdb",
    "greynoise",
    "google-webrisk",
    "virustotal",
]


def load_provider(name: str):
    path = PROVIDER_ROOT / name / "adapter.py"
    if not path.exists():
        raise AssertionError(f"missing provider adapter: {path}")
    spec = importlib.util.spec_from_file_location(f"{name}_adapter", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ExternalProviderModuleTests(unittest.TestCase):
    def test_external_provider_templates_are_queue_scoped_disabled_and_fail_soft(self):
        for name in EXTERNAL_PROVIDERS:
            with self.subTest(provider=name):
                template = PROVIDER_ROOT / name / "module.env.template"
                self.assertTrue(template.exists(), f"missing template for {name}")
                content = template.read_text(encoding="utf-8")
                self.assertIn("AEGIS_PROVIDER_ENABLED=false", content)
                self.assertIn("AEGIS_PROVIDER_INPUT_SCOPE=queue", content)
                self.assertIn("AEGIS_PROVIDER_CACHE_ENABLED=true", content)
                self.assertIn("AEGIS_PROVIDER_FAIL_SOFT=true", content)

    def test_urlhaus_maps_host_response_to_categories(self):
        provider = load_provider("urlhaus")

        categories = provider.categories_from_response(
            {
                "query_status": "ok",
                "blacklists": {"spamhaus_dbl": "phishing_domain"},
                "urls": [
                    {"threat": "malware_download", "tags": ["emotet"]},
                ],
            },
            emit_tags=True,
        )

        self.assertEqual(set(categories), {"malware", "phishing", "emotet"})

    def test_threatfox_maps_ioc_response_to_categories(self):
        provider = load_provider("threatfox")

        categories = provider.categories_from_response(
            {
                "query_status": "ok",
                "data": [
                    {
                        "threat_type": "botnet_cc",
                        "malware_printable": "Cobalt Strike",
                        "confidence_level": 75,
                    }
                ],
            },
            emit_malware_families=True,
            emit_tags=True,
        )

        self.assertEqual(set(categories), {"c2", "cobalt-strike"})

    def test_abuseipdb_maps_score_and_report_categories(self):
        provider = load_provider("abuseipdb")

        categories = provider.categories_from_response(
            {
                "data": {
                    "abuseConfidenceScore": 85,
                    "totalReports": 3,
                    "reports": [{"categories": [18, 22]}],
                }
            },
            malicious_threshold=75,
            abuse_threshold=25,
        )

        self.assertEqual(set(categories), {"abuse", "malicious", "brute-force", "ssh"})

    def test_greynoise_maps_noise_response_to_categories(self):
        provider = load_provider("greynoise")

        categories = provider.categories_from_response(
            {"noise": True, "riot": False, "classification": "malicious"}
        )

        self.assertEqual(set(categories), {"internet-scanner", "malicious"})

    def test_google_webrisk_maps_threat_types_to_categories(self):
        provider = load_provider("google-webrisk")

        categories = provider.categories_from_response(
            {"threat": {"threatTypes": ["MALWARE", "SOCIAL_ENGINEERING"]}}
        )

        self.assertEqual(set(categories), {"malware", "phishing"})

    def test_virustotal_maps_analysis_stats_and_categories(self):
        provider = load_provider("virustotal")

        categories = provider.categories_from_response(
            {
                "data": {
                    "attributes": {
                        "last_analysis_stats": {"malicious": 4, "suspicious": 1},
                        "categories": {"vendor": "phishing"},
                    }
                }
            },
            malicious_threshold=2,
            suspicious_threshold=1,
        )

        self.assertEqual(set(categories), {"malicious", "suspicious", "phishing"})


if __name__ == "__main__":
    unittest.main()
