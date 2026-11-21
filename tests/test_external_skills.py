"""Exercise install and update with public-source responses faked in memory."""
from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import sys
import tarfile
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "installer"))
import harness
import install_dependencies as installer
import tomlkit


class ExternalSkillDeploymentTests(unittest.TestCase):
    def setUp(self):
        root = Path(self.enterContext(TemporaryDirectory())).resolve()
        self.repo, self.state, self.home = (root / name for name in ("payload", "state", "user"))
        self.codex = self.home / ".codex"
        self.host = "homelab-desktop"
        self.cache = self.state / installer.EXTERNAL_SKILL_CACHE
        self.graph, self.openspec = (root / name for name in ("codegraph.cmd", "openspec.cmd"))
        self.write(self.graph, b"fixture")
        self.write(self.openspec, b"fixture")
        self.write(self.repo / "common/AGENTS.md", b"# Shared instructions")
        self.write(self.repo / "common/config.toml", b"[mcp_servers.codegraph]\ncommand = 'codegraph'\n")
        self.write(self.repo / "package.json", b'{"supportedHosts":["homelab-desktop"]}')
        self.write(self.repo / "dependencies/dependencies.lock.json", json.dumps({
            "schema_version": 1, "plugins": [],
            "codegraph": {"package": "@colbymchenry/codegraph", "version": "1.2.3"},
        }).encode())
        self.write(self.codex / "config.toml", b"[mcp_servers.node_repl]\ncommand = 'fixture'\n")
        self.write(self.repo / "skills/adapters/words/SKILL.md", b"# Our document adapter\n")
        specs = [
            {"name": "layout", "role": "upstream", "source": "https://github.com/official/layout.git",
             "channel": "default-branch", "files": {".": "kit"}},
            {"name": "words", "role": "adapter", "path": "skills/adapters/words", "adapts": "official/words",
             "source": "https://github.com/official/words.git", "channel": "default-branch",
             "files": {"references/SPEC.md": "SPEC.md"}},
        ]
        self.write(self.repo / "registry.toml", tomlkit.dumps({"schema_version": 1, "skills": specs}).encode())
        self.revision = "1" * 40
        self.broken_words = False
        self.requests = []

    @staticmethod
    def write(path, data):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    @staticmethod
    def pack_files(files):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode="w:gz") as archive:
            for name, data in files.items():
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                archive.addfile(entry, io.BytesIO(data))
        return stream.getvalue()

    def fetch(self, url):
        self.requests.append(url)
        if url.startswith("https://registry.npmjs.org/") and url.endswith("/latest"):
            package = "@colbymchenry/codegraph" if "codegraph" in url else "@fission-ai/openspec"
            return json.dumps({"name": package, "version": "1.2.3", "dist": {
                "integrity": "sha512-" + "A" * 86 + "==", "tarball": "https://fixtures.invalid/tool.tgz",
            }}).encode()
        if url.startswith("https://api.github.com/repos/official/") and url.endswith("/commits/HEAD"):
            return json.dumps({"sha": self.revision}).encode()
        for project in ("layout", "words"):
            if url == f"https://codeload.github.com/official/{project}/tar.gz/{self.revision}":
                break
        else:
            raise AssertionError(f"Unexpected request: {url}")
        if project == "layout":
            files = {"kit/SKILL.md": f"layout at {self.revision}".encode()}
            if self.revision.startswith("1"):
                files["kit/references/old.md"] = b"old reference"
        else:
            filename = "moved.md" if self.broken_words else "SPEC.md"
            files = {filename: f"official rules at {self.revision}".encode()}
        return self.pack_files({f"{project}-{self.revision}/{name}": data for name, data in files.items()})

    def run_installer(self, *args):
        self.output = io.StringIO()
        with (patch.object(installer, "REPO", self.repo),
              patch.object(installer, "os", SimpleNamespace(name="nt", environ={})),
              patch.object(installer.platform, "machine", return_value="AMD64"),
              patch.object(installer.shutil, "which", return_value="fixture"),
              patch.object(installer, "find_codex", return_value="fixture"),
              patch.object(installer, "check_openspec_node"),
              patch.object(installer, "fetch", side_effect=self.fetch),
              patch.object(installer, "install_codegraph", return_value=self.graph) as graph,
              patch.object(installer, "install_openspec", return_value=self.openspec),
              patch.object(installer, "install_plugins"),
              redirect_stdout(self.output), redirect_stderr(self.output)):
            rc = installer.main(["--host", self.host, "--codex-home", str(self.codex), "--state-root",
                                 str(self.state), *args])
            self.install_calls = graph.call_count
        return rc

    def plan(self):
        return harness.build_plan(self.repo, self.host, self.home, codex_home=self.codex, state_root=self.state)

    def installed(self, path):
        return self.home / ".agents/skills" / path

    def run_harness(self, command):
        self.output = io.StringIO()
        with (patch.object(harness, "REPO", self.repo),
              redirect_stdout(self.output), redirect_stderr(self.output)):
            return harness.main([command, "--host", self.host, "--home", str(self.home),
                                 "--codex-home", str(self.codex), "--state-root", str(self.state)])

    def test_first_install_refresh_and_offline_replay(self):
        self.assertEqual(self.run_installer(), 0, self.output.getvalue())
        self.assertFalse(self.state.exists())
        self.assertEqual(self.plan().deferred, ["External skill cache is missing. Run ordinary install or update."])
        self.requests.clear()
        self.assertEqual(self.run_installer("--install", "--locked"), 2)
        self.assertIn("External skill cache is missing", self.output.getvalue())
        self.assertEqual(self.requests, [])
        self.assertEqual(self.install_calls, 0)
        self.assertFalse(self.state.exists())

        self.write(self.cache, b"not JSON")
        self.assertEqual(self.plan().deferred, ["Invalid external skill cache. Run ordinary install or update."])
        self.assertEqual(self.run_installer("--install"), 0, self.output.getvalue())
        self.assertEqual(self.plan().missing, [])
        self.assertEqual(self.plan().deferred, [])
        harness.apply_plan(self.plan())
        self.assertEqual(self.installed("layout/SKILL.md").read_bytes(), f"layout at {self.revision}".encode())
        self.assertEqual(self.installed("words/SKILL.md").read_bytes(), b"# Our document adapter\n")
        self.assertEqual(self.installed("words/references/SPEC.md").read_bytes(),
                         f"official rules at {self.revision}".encode())
        self.assertTrue(self.installed("layout/references/old.md").is_file())
        self.assertFalse(self.plan().changes)

        self.revision = "2" * 40
        self.assertEqual(self.run_installer("--install"), 0, self.output.getvalue())
        harness.apply_plan(self.plan())
        self.assertEqual(self.installed("layout/SKILL.md").read_bytes(), f"layout at {self.revision}".encode())
        self.assertFalse(self.installed("layout/references/old.md").exists())
        self.requests.clear()
        before = self.cache.read_bytes()
        self.assertEqual(self.run_installer("--install", "--locked"), 0, self.output.getvalue())
        self.assertEqual(self.requests, [])
        self.assertEqual(self.install_calls, 1)
        self.assertEqual(self.cache.read_bytes(), before)
        self.assertFalse(self.plan().changes)
        manifest = self.repo / "registry.toml"
        declarations = tomlkit.parse(manifest.read_text(encoding="utf-8"))
        declarations["skills"][0]["channel"] = "latest-release"
        manifest.write_text(tomlkit.dumps(declarations), encoding="utf-8")
        stale = self.plan()
        self.assertEqual(stale.missing, [])
        self.assertEqual(stale.deferred, ["External skill cache does not match layout. Run ordinary install or update."])
        self.assertEqual(self.run_installer("--install", "--locked"), 2)
        self.assertIn("cache does not match layout", self.output.getvalue())
        self.assertEqual(self.install_calls, 0)
        self.assertEqual(self.requests, [])

    def test_failed_update_keeps_cache_and_profile(self):
        self.assertEqual(self.run_installer("--install"), 0, self.output.getvalue())
        harness.apply_plan(self.plan())
        before = self.cache.read_bytes()
        lock = self.state / "sources/dependencies.lock.json"
        lock_before = lock.read_bytes()
        self.revision = "2" * 40
        self.broken_words = True
        self.assertEqual(self.run_installer("--install"), 2)
        self.assertEqual(self.install_calls, 0)
        self.assertEqual(self.cache.read_bytes(), before)
        self.assertEqual(lock.read_bytes(), lock_before)
        self.assertFalse(self.plan().changes)

        self.assertEqual(self.installed("layout/SKILL.md").read_bytes(), b"layout at " + b"1" * 40)
        self.assertEqual(self.installed("words/references/SPEC.md").read_bytes(), b"official rules at " + b"1" * 40)

    def test_apply_updates_available_skill_and_common_files_despite_corrupt_record(self):
        self.assertEqual(self.run_installer("--install"), 0, self.output.getvalue())
        harness.apply_plan(self.plan())
        self.revision = "2" * 40
        self.assertEqual(self.run_installer("--install"), 0, self.output.getvalue())
        corrupt = json.loads(self.cache.read_bytes())
        corrupt["skills"]["layout"]["files"]["SKILL.md"] = "Y2hhbmdlZA=="
        damaged_cache = json.dumps(corrupt).encode()
        self.write(self.cache, damaged_cache)
        self.write(self.repo / "common/AGENTS.md", b"# Updated instructions\n")
        config = self.repo / "common/config.toml"
        config.write_bytes(b"[features]\nmulti_agent = true\n\n" + config.read_bytes())

        plan = self.plan()
        self.assertEqual(plan.missing, [])
        self.assertEqual(plan.deferred, ["Invalid external skill payload for layout. Run ordinary install or update."])
        self.assertEqual({change.path.relative_to(self.home).as_posix() for change in plan.changes}, {
            ".agents/skills/words/references/SPEC.md", ".codex/AGENTS.md", ".codex/config.toml",
        })
        self.assertEqual(self.run_harness("apply"), 0, self.output.getvalue())
        self.assertEqual(self.installed("words/references/SPEC.md").read_bytes(),
                         f"official rules at {self.revision}".encode())
        self.assertTrue((self.codex / "AGENTS.md").read_bytes().startswith(b"# Updated instructions\n"))
        merged = tomlkit.parse((self.codex / "config.toml").read_text(encoding="utf-8"))
        self.assertTrue(merged["features"]["multi_agent"])
        self.assertEqual(self.installed("layout/SKILL.md").read_bytes(), b"layout at " + b"1" * 40)
        self.assertEqual(self.installed("layout/references/old.md").read_bytes(), b"old reference")
        self.assertEqual(self.cache.read_bytes(), damaged_cache)
        self.assertEqual(self.plan().changes, [])
        self.assertEqual(self.run_harness("check"), 1, self.output.getvalue())
        self.assertIn(f"DEFERRED {plan.deferred[0]}", self.output.getvalue())
