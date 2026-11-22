"""Offline tests for the dependency preview, integrity checks and local overrides."""
from contextlib import redirect_stdout
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "installer"))
import install_dependencies as installer
from harness import REGISTRY_PATH, SEED_LOCK
import tomlkit


class DependencyTests(unittest.TestCase):
    def openspec_record(self):
        return {"package": "@fission-ai/openspec", "version": "2.0.0",
                "source": "https://github.com/Fission-AI/OpenSpec",
                "integrity": "sha512-" + "A" * 86 + "==",
                "tarball": "https://fixtures.test/openspec.tgz"}

    def make_openspec(self, local):
        prefix = local / "tools/openspec"
        package = prefix / "node_modules/@fission-ai/openspec"
        (package / "bin").mkdir(parents=True)
        manifest = package / "package.json"
        manifest.write_text(json.dumps({"name": "@fission-ai/openspec", "version": "2.0.0",
                                        "bin": {"openspec": "bin/openspec.js"}}), encoding="utf-8")
        receipt = prefix / "package-lock.json"
        receipt.write_text(json.dumps({"packages": {"node_modules/@fission-ai/openspec": {
            "version": "2.0.0", "integrity": self.openspec_record()["integrity"]}}}), encoding="utf-8")
        entrypoint = package / "bin/openspec.js"
        entrypoint.write_text('#!/usr/bin/env node\nconsole.log("2.0.0");\n', encoding="utf-8")
        launcher = prefix / "node_modules/.bin/openspec.cmd"
        launcher.parent.mkdir()
        launcher.write_text('@ECHO off\nSET dp0=%~dp0\nnode "%dp0%\\..\\@fission-ai\\openspec\\bin\\openspec.js" %*\n')
        return prefix, manifest, receipt, entrypoint, launcher

    def test_openspec_install_verifies_identity_receipt_and_normalized_bin(self):
        for bin_path in ("bin/openspec.js", "./bin/openspec.js"):
            with self.subTest(bin_path=bin_path), TemporaryDirectory() as directory:
                local = Path(directory)
                prefix, manifest, _, _, launcher = self.make_openspec(local)
                metadata = json.loads(manifest.read_text(encoding="utf-8"))
                metadata["bin"]["openspec"] = bin_path
                manifest.write_text(json.dumps(metadata), encoding="utf-8")
                with patch.object(installer.subprocess, "run") as execute:
                    self.assertEqual(installer.install_openspec(self.openspec_record(), local, "fixture-npm"), launcher)
                execute.assert_called_once_with([
                    "fixture-npm", "install", "--prefix", str(prefix), "--ignore-scripts",
                    "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org",
                    "@fission-ai/openspec@2.0.0"], check=True)
                self.assertIn(b'SET "dp0=%~dp0"', launcher.read_bytes())

    def test_openspec_install_rejects_changed_package_receipt_or_bin(self):
        for failure in ("name", "version", "receipt-version", "integrity", "bin", "entrypoint", "launcher"):
            with self.subTest(failure=failure), TemporaryDirectory() as directory:
                local = Path(directory)
                _, manifest, receipt, entrypoint, launcher = self.make_openspec(local)
                metadata = json.loads(manifest.read_text(encoding="utf-8"))
                installed = json.loads(receipt.read_text(encoding="utf-8"))
                if failure in ("name", "version"):
                    metadata[failure] = "unexpected"
                elif failure in ("receipt-version", "integrity"):
                    installed["packages"]["node_modules/@fission-ai/openspec"][
                        "version" if failure == "receipt-version" else "integrity"] = "unexpected"
                elif failure == "bin":
                    metadata["bin"]["openspec"] = "../../other.js"
                else:
                    (entrypoint if failure == "entrypoint" else launcher).unlink()
                manifest.write_text(json.dumps(metadata), encoding="utf-8")
                receipt.write_text(json.dumps(installed), encoding="utf-8")
                with patch.object(installer.subprocess, "run"), self.assertRaises(installer.HarnessError):
                    installer.install_openspec(self.openspec_record(), local, "fixture-npm")

    @unittest.skipUnless(os.name == "nt" and shutil.which("node"), "Windows and Node are required")
    def test_openspec_real_npm_shim_runs_from_special_character_state_path(self):
        node = shutil.which("node")
        npm = shutil.which("npm")
        candidates = [Path(node).parent / "node_modules/npm/node_modules/cmd-shim"]
        if npm:
            candidates.append(Path(npm).parent / "node_modules/npm/node_modules/cmd-shim")
        cmd_shim = next((path for path in candidates if (path / "package.json").is_file()), None)
        if cmd_shim is None:
            self.skipTest("npm's bundled cmd-shim module is unavailable")
        with TemporaryDirectory() as directory:
            local = Path(directory) / "state [literal] & $cache's 한글"
            _, _, _, entrypoint, launcher = self.make_openspec(local)
            subprocess.run([node, "-e",
                            "require(process.argv[1])(process.argv[2], process.argv[3]).catch(e => { console.error(e); process.exit(1) })",
                            str(cmd_shim), str(entrypoint), str(launcher.with_suffix(""))],
                           check=True, capture_output=True, text=True, encoding="utf-8")
            with patch.object(installer.subprocess, "run"):
                installed = installer.install_openspec(self.openspec_record(), local, "fixture-npm")
            result = subprocess.run([str(installed), "--version"], capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), "2.0.0")

    def test_openspec_node_engine_accepts_minimum_and_newer_versions(self):
        for version in ("v22.12.0\n", "v22.12.1", "v22.99.0", "v23.0.0", "v24.18.1"):
            with self.subTest(version=version), patch.object(installer.subprocess, "run",
                    return_value=subprocess.CompletedProcess([], 0, version)) as execute:
                installer.check_openspec_node("fixture-node")
                self.assertEqual(execute.call_args.args[0], ["fixture-node", "--version"])

    def test_openspec_node_engine_rejects_old_missing_and_unreadable_node(self):
        for version in ("v20.19.0", "v22.11.9", "v22.12.0-rc.1", "unknown"):
            with self.subTest(version=version), patch.object(installer.subprocess, "run",
                    return_value=subprocess.CompletedProcess([], 0, version)), \
                    self.assertRaisesRegex(installer.HarnessError, r"Node.js >=22\.12\.0"):
                installer.check_openspec_node("fixture-node")
        with self.assertRaisesRegex(installer.HarnessError, r"Node.js >=22\.12\.0"):
            installer.check_openspec_node(None)
        for failure in (OSError("missing"), subprocess.CalledProcessError(1, ["node"])):
            with self.subTest(failure=failure), patch.object(installer.subprocess, "run", side_effect=failure), \
                    self.assertRaisesRegex(installer.HarnessError, r"Node.js >=22\.12\.0"):
                installer.check_openspec_node("fixture-node")

    @unittest.skipUnless(os.name == "nt" and shutil.which("node"), "Windows and Node are required")
    def test_codegraph_launcher_runs_from_a_state_path_with_ampersand(self):
        with TemporaryDirectory() as directory:
            local = Path(directory) / "state & literal"
            prefix = local / "tools/codegraph"
            package = prefix / "node_modules/@colbymchenry/codegraph"
            package.mkdir(parents=True)
            (package / "package.json").write_text(json.dumps({"version": "1.6.2"}))
            (package / "npm-shim.js").write_text('console.log("1.6.2");\n')
            (prefix / "package-lock.json").write_text(json.dumps({"packages": {
                "node_modules/@colbymchenry/codegraph": {"integrity": "fixture-integrity"}}}))
            bundle = prefix / "node_modules/@colbymchenry/codegraph-win32-x64"
            (bundle / "lib/dist/bin").mkdir(parents=True)
            (bundle / "node.exe").write_bytes(b"fixture bundle")
            (bundle / "lib/dist/bin/codegraph.js").write_bytes(b"fixture entry")
            shim = prefix / "node_modules/.bin/codegraph.cmd"
            shim.parent.mkdir()
            shim.write_text('@ECHO off\nSET dp0=%~dp0\nnode "%dp0%\\..\\@colbymchenry\\codegraph\\npm-shim.js" %*\n')
            execute = subprocess.run

            def install_or_execute(command, **kwargs):
                if command[0] == "fixture-npm":
                    return subprocess.CompletedProcess(command, 0)
                return execute(command, **kwargs)

            lock = {"package": "@colbymchenry/codegraph", "version": "1.6.2", "integrity": "fixture-integrity"}
            with patch.object(installer.subprocess, "run", side_effect=install_or_execute):
                installed = installer.install_codegraph(lock, local, "fixture-npm")
            result = execute([str(installed), "--version"], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), "1.6.2")

    def test_locked_preview_creates_nothing_and_never_installs_or_downloads(self):
        with TemporaryDirectory() as directory:
            repo = Path(directory)
            seed = repo / SEED_LOCK
            seed.parent.mkdir(parents=True)
            seed.write_bytes((installer.REPO / SEED_LOCK).read_bytes())
            registry = tomlkit.parse((installer.REPO / REGISTRY_PATH).read_text(encoding="utf-8"))
            registry["skills"] = [skill for skill in registry["skills"] if "source" not in skill]
            (repo / REGISTRY_PATH).write_text(tomlkit.dumps(registry), encoding="utf-8")
            repo.joinpath("package.json").write_bytes(installer.REPO.joinpath("package.json").read_bytes())
            before = set(repo.rglob("*"))
            with patch.object(installer, "REPO", repo), patch.object(installer, "find_codex", return_value=None), \
                    patch.object(installer, "install_codegraph") as graph, \
                    patch.object(installer, "install_openspec") as openspec, \
                    patch.object(installer, "install_plugins") as plugins, \
                    patch.object(installer, "install_local_plugins") as local_plugins, \
                    patch.object(installer.mcp_packages, "install") as mcp, \
                    patch.object(installer.urllib.request, "urlopen") as network, redirect_stdout(io.StringIO()):
                self.assertEqual(installer.main(["--host", "homelab-desktop", "--locked", "--codex-home", str(repo / "fake-home")]), 0)
                for call in (graph, openspec, plugins, local_plugins, mcp, network):
                    call.assert_not_called()
            self.assertEqual(before, set(repo.rglob("*")))

    def test_local_paths_keep_private_overrides_and_comments(self):
        with TemporaryDirectory() as directory:
            local = Path(directory) / "local.toml"
            local.write_text('# keep this\n[paths]\nagent_desktop = "D:/existing.exe"\n\n[config.desktop]\nautoArchiveAfterDays = 9\n', encoding="utf-8")
            with redirect_stdout(io.StringIO()):
                installer.save_paths(local, Path("new-codegraph.cmd"))
            result = tomlkit.parse(local.read_text(encoding="utf-8"))
            self.assertEqual(result["paths"]["agent_desktop"], "D:/existing.exe")
            self.assertEqual(result["paths"]["codegraph"], "new-codegraph.cmd")
            self.assertEqual(result["config"]["desktop"]["autoArchiveAfterDays"], 9)
            self.assertIn("# keep this", local.read_text(encoding="utf-8"))

    def test_optional_openspec_path_is_added_without_overwriting_private_override(self):
        with TemporaryDirectory() as directory:
            local = Path(directory) / "local.toml"
            installer.save_paths(local, Path("graph.cmd"))
            self.assertEqual(tomlkit.parse(local.read_text(encoding="utf-8"))["paths"], {"codegraph": "graph.cmd"})
            installer.save_paths(local, Path("graph.cmd"), Path("openspec.cmd"))
            self.assertEqual(tomlkit.parse(local.read_text(encoding="utf-8"))["paths"]["openspec"], "openspec.cmd")
            original = '# keep this\n[paths]\nopenspec = "D:/private/openspec.cmd"\n'
            local.write_text(original, encoding="utf-8")
            with redirect_stdout(io.StringIO()):
                installer.save_paths(local, Path("graph.cmd"), Path("managed/openspec.cmd"))
            result = tomlkit.parse(local.read_text(encoding="utf-8"))
            self.assertEqual(result["paths"]["openspec"], "D:/private/openspec.cmd")
            self.assertIn("# keep this", local.read_text(encoding="utf-8"))
            before = local.read_bytes()
            installer.save_paths(local, Path("graph.cmd"))
            self.assertEqual(local.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
