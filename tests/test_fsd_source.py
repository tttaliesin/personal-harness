"""Verify the complete imported FSD skill against its recorded upstream bytes."""
import hashlib
import json
from pathlib import Path
import re
import unittest


class FsdSourceTests(unittest.TestCase):
    def test_imported_skill_and_upstream_notice_match_provenance(self):
        repo = Path(__file__).resolve().parents[1]
        provenance = json.loads((repo / "sources/feature-sliced-skill.json").read_text(encoding="utf-8"))
        self.assertEqual(provenance["source"], "https://github.com/feature-sliced/skills")
        self.assertRegex(provenance["source_commit"], r"^[0-9a-f]{40}$")
        root = repo / "skills/feature-sliced-design"
        actual = {path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
                  for path in root.rglob("*") if path.is_file()}
        self.assertEqual(actual, provenance["files_sha256"])
        self.assertIn("SKILL.md", actual)
        self.assertIn("evals/evals.json", actual)
        self.assertTrue(any(name.startswith("references/") for name in actual))
        digest = hashlib.sha256(json.dumps(actual, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        self.assertEqual(digest, provenance["content_sha256"])
        notice = provenance["upstream_readme"]
        self.assertEqual(hashlib.sha256((repo / notice["path"]).read_bytes()).hexdigest(), notice["sha256"])
        skill = (root / "SKILL.md").read_text(encoding="utf-8")
        for reference in set(re.findall(r"references/[a-z0-9-]+\.md", skill)):
            self.assertIn(reference, actual)


if __name__ == "__main__":
    unittest.main()
