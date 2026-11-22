"""Check the source declaration for the FSD skill."""
from pathlib import Path
import unittest

import tomlkit


class FsdSourceTests(unittest.TestCase):
    def test_manifest_selects_the_complete_fsd_skill_directory(self):
        resources = Path(__file__).resolve().parents[1] / "resources"
        registry = tomlkit.parse((resources / "registry.toml").read_text(encoding="utf-8"))
        skills = {entry["name"]: entry for entry in registry["skills"]}
        self.assertEqual(skills["feature-sliced-design"], {
            "name": "feature-sliced-design",
            "role": "upstream",
            "source": "https://github.com/feature-sliced/skills.git",
            "channel": "default-branch",
            "files": {".": "feature-sliced-design"},
        })


if __name__ == "__main__":
    unittest.main()
