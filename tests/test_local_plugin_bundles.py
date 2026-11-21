"""Check local Codex marketplace installation without a live profile."""

from contextlib import redirect_stdout
from dataclasses import replace
from io import StringIO
import json
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import tomlkit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "installer"))

from harness import HarnessError, build_plan, local_bundle_records, local_plugin_cache_matches, read_toml
import install_dependencies as installer
from install_dependencies import install_local_plugins, register_marketplace
from local_plugin_bundles import directory_digest, inspect_bundle
from registry import Registry, load_registry, lock_issues, parse_registry


SELECTOR = "fixture@fixture-local"
LEGACY_BUNDLE_LOCATIONS = {
    "repo-governance-local": "missing repo governance bundle",
    "windows-agent-devkit-local": "missing windows agent devkit bundle",
    "worker-orchestrator-local": "${OLD_BUNDLE_ROOT}/worker-orchestrator",
}


def write_bundle(root: Path, body: str) -> dict:
    catalog = root / ".agents/plugins/marketplace.json"
    catalog.parent.mkdir(parents=True)
    catalog.write_text(json.dumps({"name": "fixture-local", "plugins": [
        {"name": "fixture", "source": {"source": "local", "path": "./"}}
    ]}), encoding="utf-8")
    manifest = root / ".codex-plugin/plugin.json"
    manifest.parent.mkdir()
    manifest.write_text(json.dumps({"name": "fixture", "version": "1.0.0"}), encoding="utf-8")
    (root / "skill.txt").write_text(body, encoding="utf-8")
    return {"name": "fixture", "source_path": "plugins/fixture",
            "marketplace": "fixture-local", "version": "1.0.0",
            "enabled": True, "bundle_sha256": directory_digest(root)}


class LocalPluginBundleTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.bundle = self.root / "approved bundle"
        self.pin = write_bundle(self.bundle, "approved")
        self.record = inspect_bundle(self.pin, self.bundle)
        self.home = self.root / "codex"
        self.home.mkdir()
        self.config = self.home / "config.toml"
        self.config.write_text('[plugins."other@unrelated"]\nenabled = false\n', encoding="utf-8")
        self.cache = self.home / "plugins/cache/fixture-local/fixture/1.0.0"

    def simulate_cli(self, command, **kwargs):
        self.assertEqual(kwargs["env"]["CODEX_HOME"], str(self.home))
        self.assertEqual(command[-1], "--json")
        current = read_toml(self.config)
        if command[2:4] == ["marketplace", "add"]:
            current.setdefault("marketplaces", tomlkit.table())["fixture-local"] = {
                "source_type": "local", "source": command[4]
            }
        elif command[2:4] == ["marketplace", "remove"]:
            del current["marketplaces"]["fixture-local"]
            if SELECTOR in current["plugins"]:
                del current["plugins"][SELECTOR]
        elif command[2:4] == ["add", SELECTOR]:
            path = Path(current["marketplaces"]["fixture-local"]["source"])
            shutil.copytree(path, self.cache, dirs_exist_ok=True)
            current["plugins"][SELECTOR] = {"enabled": True}
        else:
            self.fail(f"Unexpected command: {command}")
        self.config.write_text(tomlkit.dumps(current), encoding="utf-8")

    def test_host_path_controls_selection_and_must_match_bundle(self):
        self.assertEqual(local_bundle_records((self.pin,), {}, self.root), [])
        self.assertEqual(local_bundle_records(
            (self.pin,), {"fixture-local": "approved bundle"}, self.root), [self.record])
        with self.assertRaisesRegex(HarnessError, "plugin_bundles"):
            local_bundle_records((self.pin,), {**LEGACY_BUNDLE_LOCATIONS, "typo": "approved bundle"}, self.root)
        (self.bundle / "skill.txt").write_text("changed", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "bundle_sha256"):
            local_bundle_records((self.pin,), {"fixture-local": str(self.bundle)}, self.root)

    def test_registry_retires_the_three_legacy_bundles_and_preserves_network_lock(self):
        registry = load_registry(ROOT / "registry.toml")
        lock = json.loads((ROOT / "dependencies/dependencies.lock.json").read_text(encoding="utf-8"))
        self.assertEqual(lock_issues(registry, lock), [])
        self.assertTrue({spec["marketplace"] for spec in registry.local_plugins}.isdisjoint(LEGACY_BUNDLE_LOCATIONS))

    def test_registry_validates_generic_local_bundle_declarations(self):
        text = (ROOT / "registry.toml").read_text(encoding="utf-8")
        local_entry = tomlkit.dumps({"local_plugins": [self.pin]})
        self.assertIn(self.pin, parse_registry(text + "\n" + local_entry).local_plugins)
        conflicting = local_entry.replace('marketplace = "fixture-local"', 'marketplace = "taste-skill"')
        with self.assertRaisesRegex(ValueError, "Conflicting marketplace"):
            parse_registry(text + "\n" + conflicting)
        with self.assertRaisesRegex(ValueError, "Invalid local plugin fields"):
            parse_registry(text + "\n" + local_entry + '\nsource = "C:/private-bundle"\n')

    def test_only_undeclared_legacy_bundle_paths_are_ignored(self):
        locations = {**LEGACY_BUNDLE_LOCATIONS, "fixture-local": "${STATE_ROOT}/approved bundle"}
        variables = {"STATE_ROOT": self.root.as_posix()}
        self.assertEqual(local_bundle_records(
            (self.pin,), locations, self.root, variables=variables), [self.record])

        declared = {**self.pin, "marketplace": "worker-orchestrator-local"}
        with self.assertRaisesRegex(HarnessError, "Unknown path placeholder"):
            local_bundle_records((declared, self.pin), locations, self.root, variables=variables)

    def test_plan_ignores_retired_bundle_paths_and_preserves_existing_selections(self):
        host_config = self.root / "homelab-desktop.toml"
        lock = self.root / "sources/dependencies.lock.json"
        lock.parent.mkdir()
        shutil.copyfile(ROOT / "dependencies/dependencies.lock.json", lock)
        current = read_toml(self.config)
        current["marketplaces"] = {"repo-governance-local": {
            "source_type": "local", "source": (self.root / LEGACY_BUNDLE_LOCATIONS["repo-governance-local"]).as_posix(),
        }}
        current["plugins"]["repo-governance@repo-governance-local"] = {"enabled": False}
        self.config.write_text(tomlkit.dumps(current), encoding="utf-8")
        args = (ROOT, "homelab-desktop", self.root / "user", self.home)
        baseline = build_plan(*args, state_root=self.root)

        host_config.write_text(tomlkit.dumps({"plugin_bundles": LEGACY_BUNDLE_LOCATIONS}), encoding="utf-8")
        plan = build_plan(*args, state_root=self.root)

        self.assertEqual(plan, baseline)
        config_change = next(change for change in plan.changes if change.path == self.config)
        planned = tomlkit.parse(config_change.after.decode("utf-8"))
        self.assertEqual(planned["marketplaces"], current["marketplaces"])
        for selector, selection in current["plugins"].items():
            self.assertEqual(planned["plugins"][selector], selection)

    @unittest.skipUnless(sys.platform == "win32", "Dependency installation targets Windows")
    def test_locked_install_preserves_retired_host_paths(self):
        host_config = self.root / "homelab-desktop.toml"
        host_config.write_text('[paths]\ncodegraph = "existing-graph.cmd"\n\n'
                               + tomlkit.dumps({"plugin_bundles": LEGACY_BUNDLE_LOCATIONS}), encoding="utf-8")
        before = self.config.read_bytes()
        registry = replace(load_registry(ROOT / "registry.toml"), skills=())
        with (
            patch.object(installer, "load_registry", return_value=registry),
            patch.object(installer, "find_codex", return_value="fixture-codex"),
            patch.object(installer.platform, "machine", return_value="AMD64"),
            patch.object(installer.shutil, "which", return_value="fixture-tool"),
            patch.object(installer, "check_openspec_node"),
            patch.object(installer, "install_codegraph", return_value=self.root / "new-graph.cmd"),
            patch.object(installer, "install_openspec", return_value=self.root / "openspec.cmd"),
            patch.object(installer, "install_plugins"),
            patch.object(installer, "install_local_plugins") as install_bundles,
            patch.object(installer.mcp_packages, "install"),
            redirect_stdout(StringIO()),
        ):
            self.assertEqual(installer.main([
                "--host", "homelab-desktop", "--locked", "--install", "--state-root", str(self.root),
                "--home", str(self.root / "user"), "--codex-home", str(self.home),
            ]), 0)
            install_bundles.assert_not_called()

        settings = read_toml(host_config)
        self.assertEqual(settings["plugin_bundles"], LEGACY_BUNDLE_LOCATIONS)
        self.assertEqual(settings["paths"]["codegraph"], "existing-graph.cmd")
        self.assertEqual(self.config.read_bytes(), before)

    def test_plan_reports_missing_configured_bundle_and_preserves_unset_registration(self):
        state = self.root / "state"
        state.mkdir()
        host_config = state / "homelab-desktop.toml"
        registry = Registry(plugins=(), mcp=(), fingerprint="", local_plugins=(self.pin,))
        before = self.config.read_bytes()
        with patch("harness.load_registry", return_value=registry):
            plan = build_plan(ROOT, "homelab-desktop", self.root / "user", self.home, state_root=state)
            self.assertTrue(any("optional local marketplace fixture-local" in n.lower() for n in plan.notes))
            self.assertFalse(any("fixture" in problem for problem in plan.missing))

            host_config.write_text("[plugin_bundles]\nfixture-local = '../approved bundle'\n", encoding="utf-8")
            plan = build_plan(ROOT, "homelab-desktop", self.root / "user", self.home, state_root=state)
            self.assertIn(f"Local bundle installation differs for {SELECTOR}; run task install", plan.missing)

            self.assertEqual(self.config.read_bytes(), before)
            with patch("install_dependencies.subprocess.run", side_effect=self.simulate_cli):
                install_local_plugins([self.record], "codex", self.home)
            plan = build_plan(ROOT, "homelab-desktop", self.root / "user", self.home, state_root=state)
            self.assertFalse(any("fixture" in problem for problem in plan.missing))

    def test_installs_verifies_and_skips_matching_installations(self):
        with patch("install_dependencies.subprocess.run", side_effect=self.simulate_cli) as execute:
            install_local_plugins([self.record], "codex", self.home)
            self.assertEqual([c.args[0][2:-1] for c in execute.call_args_list], [
                ["marketplace", "add", str(self.bundle)], ["add", SELECTOR],
            ])
            before = self.config.read_bytes()
            execute.reset_mock()
            install_local_plugins([self.record], "codex", self.home)
            execute.assert_not_called()
            self.assertEqual(self.config.read_bytes(), before)
            (self.cache / "skill.txt").write_text("stale", encoding="utf-8")
            install_local_plugins([self.record], "codex", self.home)
            self.assertEqual(execute.call_args.args[0][2:-1], ["add", SELECTOR])
        self.assertTrue(local_plugin_cache_matches(self.record, self.home))
        self.assertEqual(read_toml(self.config)["plugins"]["other@unrelated"], {"enabled": False})

    def test_bundle_modified_after_preflight_never_reaches_cli(self):
        (self.bundle / "skill.txt").write_text("changed", encoding="utf-8")
        before = self.config.read_bytes()
        with patch("install_dependencies.subprocess.run") as execute:
            with self.assertRaisesRegex(HarnessError, "changed before installation"):
                install_local_plugins([self.record], "codex", self.home)
            execute.assert_not_called()
        self.assertEqual(self.config.read_bytes(), before)

    def test_conflicting_managed_sources_are_preserved(self):
        with patch("install_dependencies.subprocess.run") as execute:
            self.config.write_text('[marketplaces.fixture-local]\nsource_type = "git"\nsource = "https://example.test/git"\n')
            with self.assertRaisesRegex(HarnessError, "unrelated registration"):
                install_local_plugins([self.record], "codex", self.home)
            self.config.write_text('[marketplaces.fixture-local]\nsource_type = "local"\nsource = "C:/staged"\n')
            with self.assertRaisesRegex(HarnessError, "replace local marketplace"):
                register_marketplace({"marketplace": "fixture-local"}, "codex", self.home, {})
            execute.assert_not_called()

    def test_replacing_previous_directory_rolls_back_if_install_fails(self):
        older = self.root / "older"
        old_record = inspect_bundle(write_bundle(older, "old content"), older)
        with patch("install_dependencies.subprocess.run", side_effect=self.simulate_cli):
            install_local_plugins([old_record], "codex", self.home)
        current = read_toml(self.config)
        current["plugins"][SELECTOR]["enabled"] = False
        self.config.write_text(tomlkit.dumps(current), encoding="utf-8")

        def fail_new_install(command, **kwargs):
            source = read_toml(self.config).get("marketplaces", {}).get("fixture-local", {}).get("source")
            if command[2:4] == ["add", SELECTOR] and source == self.record["source"]:
                raise subprocess.CalledProcessError(1, command)
            self.simulate_cli(command, **kwargs)

        with patch("install_dependencies.subprocess.run", side_effect=fail_new_install):
            with self.assertRaises(subprocess.CalledProcessError):
                install_local_plugins([self.record], "codex", self.home)
        self.assertEqual(read_toml(self.config), current)
        self.assertTrue(local_plugin_cache_matches(old_record, self.home))


if __name__ == "__main__":
    unittest.main()
