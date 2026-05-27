"""Tests for issue-form submission parsing."""
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_SCRIPTS = _HERE.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

_MODULE_PATH = _SCRIPTS / "validate-issue-submission.py"
_SPEC = importlib.util.spec_from_file_location("validate_issue_submission", _MODULE_PATH)
assert _SPEC and _SPEC.loader
validate_issue_submission = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(validate_issue_submission)


class DetectSideTests(unittest.TestCase):
    def test_type_labels_win_when_present(self):
        self.assertEqual(
            validate_issue_submission.detect_side("submission,type:block", "[allow] typo", ""),
            "block",
        )
        self.assertEqual(
            validate_issue_submission.detect_side("submission,type:allow", "[block] typo", ""),
            "allow",
        )

    def test_title_prefix_disambiguates_when_type_label_is_missing(self):
        self.assertEqual(
            validate_issue_submission.detect_side("submission", "[block] test 3", ""),
            "block",
        )
        self.assertEqual(
            validate_issue_submission.detect_side("submission", "[allow] trusted service", ""),
            "allow",
        )

    def test_body_heading_disambiguates_when_labels_and_title_are_ambiguous(self):
        self.assertEqual(
            validate_issue_submission.detect_side(
                "submission",
                "manual edit",
                "### Domains to block\n\n```text\nevil.example.com\n```",
            ),
            "block",
        )
        self.assertEqual(
            validate_issue_submission.detect_side(
                "submission",
                "manual edit",
                "### Domains to allow\n\n```text\ntrusted.example.com\n```",
            ),
            "allow",
        )

    def test_false_negative_reports_are_block_submissions(self):
        self.assertEqual(
            validate_issue_submission.detect_side("false-negative", "[false-negative] suspicious", ""),
            "block",
        )

    def test_unknown_side_still_falls_back_to_allow(self):
        self.assertEqual(validate_issue_submission.detect_side("submission", "manual edit", ""), "allow")


if __name__ == "__main__":
    unittest.main()
