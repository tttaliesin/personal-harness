import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_RUNTIME_FILES = {
    "repo-governance": ("hooks/codex.json", "skills/repo-governance/SKILL.md"),
    "windows-agent-devkit": ("dist/cli.mjs", "skills/environment-doctor/SKILL.md"),
    "worker-orchestrator": (
        "dist/cli.mjs", "skills/worker-controller/SKILL.md", "skills/worker-executor/SKILL.md",
    ),
}


class CodexMarketplaceTests(unittest.TestCase):
    def test_repository_catalog_points_to_complete_plugin_packages(self):
        catalog = json.loads((ROOT / ".agents/plugins/marketplace.json").read_bytes())
        self.assertEqual(catalog["name"], "personal-harness")
        names = [entry["name"] for entry in catalog["plugins"]]
        self.assertEqual(set(names), set(REQUIRED_RUNTIME_FILES))
        self.assertEqual(len(names), len(set(names)))
        for entry in catalog["plugins"]:
            with self.subTest(plugin=entry["name"]):
                source = entry["source"]
                self.assertEqual(source["source"], "local")
                self.assertTrue(source["path"].startswith("./"))
                plugin = (ROOT / source["path"]).resolve()
                self.assertTrue(plugin.is_relative_to(ROOT))
                self.assertEqual(plugin.parent, ROOT / "packages" / entry["name"])
                manifest = json.loads((plugin / ".codex-plugin/plugin.json").read_bytes())
                self.assertEqual(manifest["name"], entry["name"])
                self.assertTrue(manifest["version"])
                portable = plugin / "plugin.json"
                if portable.is_file():
                    identity = json.loads(portable.read_bytes())
                    self.assertEqual(identity["name"], manifest["name"])
                    self.assertEqual(identity["version"], manifest["version"])
                for relative in REQUIRED_RUNTIME_FILES[entry["name"]]:
                    self.assertTrue((plugin / relative).is_file(), relative)
