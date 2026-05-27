"""Tests for the public submission validator.

This test file is tracked in the public repository, unlike the local
pipeline tests. It exercises .github/scripts/validate.py, which is copied
from the local pipeline validator during publication.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_SCRIPTS = _HERE.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from validate import ValidationResult, load_iana_tlds, validate_entry  # noqa: E402


TLDS = {"COM", "NET", "ORG", "IO", "CO", "UK"}

VALID_CASES = [
    ("example.com", "example.com", "domain"),
    ("EXAMPLE.COM", "example.com", "domain"),
    ("example.com.", "example.com", "domain"),
    ("  example.com  ", "example.com", "domain"),
    ("a.b.c.example.com", "a.b.c.example.com", "domain"),
    ("xn--bcher-kva.com", "xn--bcher-kva.com", "domain"),
    ("a-b.example.com", "a-b.example.com", "domain"),
    ("1.2.3.4", "1.2.3.4", "ipv4"),
    ("0.0.0.0", "0.0.0.0", "ipv4"),
    ("255.255.255.255", "255.255.255.255", "ipv4"),
    ("*.example.com", "*.example.com", "domain"),
    ("*.*.example.com", "*.*.example.com", "domain"),
    ("co.uk", "co.uk", "domain"),
    ("a.io", "a.io", "domain"),
    ("a" * 63 + ".example.com", "a" * 63 + ".example.com", "domain"),
]

INVALID_CASES = [
    (None, "blank_or_whitespace"),
    ("", "blank_or_whitespace"),
    ("   ", "blank_or_whitespace"),
    (".", "blank_or_whitespace"),
    ("...", "blank_or_whitespace"),
    ("foo bar.com", "internal_whitespace"),
    ("foo\tbar.com", "internal_whitespace"),
    ("foo\nbar.com", "internal_whitespace"),
    ("a" * 64 + ".example.com", "oversized_label"),
    (
        ".".join(["a" * 63, "b" * 63, "c" * 63, "d" * 63]) + ".com",
        "oversized_total",
    ),
    ("foo..example.com", "empty_label"),
    ("localhost", "single_label"),
    ("com", "single_label"),
    ("-foo.example.com", "invalid_label_chars"),
    ("foo-.example.com", "invalid_label_chars"),
    ("foo_bar.example.com", "invalid_label_chars"),
    ("foo!.example.com", "invalid_label_chars"),
    ("foo*.example.com", "malformed_wildcard"),
    ("*foo.example.com", "malformed_wildcard"),
    ("foo.*.example.com", "malformed_wildcard"),
    ("*.", "wildcard_as_tld"),
    ("*.1.2.3.4", "wildcard_with_ipv4"),
    ("example.notarealtld", "invalid_tld"),
    ("foo.123", "numeric_tld"),
]


class ValidateEntryTests(unittest.TestCase):
    def test_valid_cases(self):
        for raw, expected_norm, expected_kind in VALID_CASES:
            with self.subTest(raw=raw):
                result = validate_entry(raw, TLDS)
                self.assertTrue(result.valid, f"{raw!r}: {result.reason}")
                self.assertEqual(result.normalized, expected_norm)
                self.assertEqual(result.kind, expected_kind)
                self.assertEqual(result.reason, "")

    def test_invalid_cases(self):
        for raw, expected_reason in INVALID_CASES:
            with self.subTest(raw=raw):
                result = validate_entry(raw, TLDS)
                self.assertFalse(result.valid, f"expected rejection of {raw!r}")
                self.assertEqual(result.reason, expected_reason)
                self.assertEqual(result.normalized, "")
                self.assertEqual(result.kind, "")

    def test_returns_named_tuple(self):
        result = validate_entry("example.com", TLDS)
        self.assertIsInstance(result, ValidationResult)
        self.assertEqual(tuple(result), (True, "example.com", "domain", ""))

    def test_empty_tld_set_rejects_domains_but_accepts_ipv4(self):
        self.assertEqual(validate_entry("example.com", set()).reason, "invalid_tld")
        result = validate_entry("1.2.3.4", set())
        self.assertTrue(result.valid)
        self.assertEqual(result.kind, "ipv4")


class LoadIanaTldsTests(unittest.TestCase):
    def test_skips_comments_blanks_and_uppercases(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "tlds.txt"
            path.write_text("# Version 1\n\ncom\nNet\n# comment\n", encoding="utf-8")
            self.assertEqual(load_iana_tlds(path), {"COM", "NET"})


if __name__ == "__main__":
    unittest.main()
