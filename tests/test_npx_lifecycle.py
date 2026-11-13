import json
import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import time
import unittest


ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
NPX = shutil.which("npx.cmd")
GIT = shutil.which("git")
NPM_CLI = Path(NODE).parent / "node_modules/npm/bin/npm-cli.js" if NODE else None
SPEC = "git+https://github.com/tttaliesin/personal-harness.git"
NAME = "@tttaliesin/personal-harness"
RELATIVE = "node_modules/@tttaliesin/personal-harness"
WINDOWS = os.name == "nt" and NODE and NPX and GIT

BOOTSTRAP = r'''
param([string]$RequestBase64)
$ErrorActionPreference = 'Stop'
$request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($RequestBase64)) | ConvertFrom-Json
[IO.File]::AppendAllText($env:LAUNCHER_LOG, (($request | ConvertTo-Json -Depth 8 -Compress) + "`n"))
if ($env:LAUNCHER_GATE) {
    [IO.File]::WriteAllText(($env:LAUNCHER_GATE + '.entered'), 'held')
    while (-not [IO.File]::Exists($env:LAUNCHER_GATE)) { Start-Sleep -Milliseconds 30 }
}
if ($env:LAUNCHER_MUTATE) {
    [IO.File]::WriteAllText((Join-Path $request.sourceRoot 'package.json'), '{}')
}
if ($env:LAUNCHER_LINK) {
    New-Item -ItemType Junction -Path (Join-Path $request.sourceRoot 'foreign') -Target $env:LAUNCHER_LINK | Out-Null
}
exit ([int]$env:LAUNCHER_EXIT)
'''


@unittest.skipUnless(WINDOWS, "Windows, Node, npx and Git are required")
class NpxLifecycleTests(unittest.TestCase):
    def setUp(self):
        scratch = ROOT / ".local"
        scratch.mkdir(exist_ok=True)
        self.directory = TemporaryDirectory(prefix="npx-lifecycle-", dir=scratch)
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.assertTrue(self.root.is_relative_to(ROOT.resolve()))
        self.directory.name = "\\\\?\\" + str(self.root)
        self.cache = self.root / "cache"
        self.entry = self.cache / "_npx/0123456789abcdef"
        self.package = self.entry / RELATIVE
        self.caller = self.root / "caller"
        self.caller.mkdir()
        self.log = self.root / "child.jsonl"
        self.npmrc = self.root / "npmrc"
        self.npmrc.write_text("", encoding="utf-8")
        self.environment = {key: value for key, value in os.environ.items()
                            if not key.lower().startswith(("npm_", "git_config_", "launcher_"))}
        self.environment.update(
            USERPROFILE=str(self.root / "profile"), HOME=str(self.root / "profile"),
            APPDATA=str(self.root / "appdata"), LOCALAPPDATA=str(self.root / "localappdata"),
            CODEX_HOME=str(self.root / "profile/.codex"),
            npm_config_cache=str(self.cache), npm_config_userconfig=str(self.npmrc),
            npm_config_globalconfig=str(self.root / "global-npmrc"),
            npm_config_update_notifier="false", npm_config_audit="false", npm_config_fund="false",
            npm_execpath=str(NPM_CLI), npm_command="exec", GIT_CONFIG_NOSYSTEM="1",
            GIT_CONFIG_GLOBAL=str(self.root / "gitconfig"), GIT_TERMINAL_PROMPT="0",
            LAUNCHER_LOG=str(self.log), LAUNCHER_EXIT="0",
        )

    def write_package(self, package):
        (package / "bin").mkdir(parents=True)
        (package / "scripts").mkdir()
        shutil.copy2(ROOT / "bin/personal-harness.mjs", package / "bin/personal-harness.mjs")
        (package / "scripts/bootstrap.ps1").write_text(BOOTSTRAP, encoding="utf-8")
        (package / "package.json").write_text(json.dumps({
            "name": NAME, "version": "0.1.0", "type": "module",
            "bin": {"personal-harness": "bin/personal-harness.mjs"},
        }), encoding="utf-8")

    def prepare_entry(self):
        self.write_package(self.package)
        dependency = {NAME: "github:tttaliesin/personal-harness"}
        (self.entry / "package.json").write_text(json.dumps({
            "dependencies": dependency, "_npx": {"packages": [SPEC]},
        }), encoding="utf-8")
        (self.entry / "package-lock.json").write_text(json.dumps({
            "lockfileVersion": 3, "packages": {
                "": {"dependencies": dependency}, RELATIVE: {
                    "version": "0.1.0", "resolved": SPEC + "#" + "a" * 40,
                    "bin": {"personal-harness": "bin/personal-harness.mjs"},
                },
            },
        }), encoding="utf-8")

    def sentinels(self):
        paths = [self.cache / "_cacache/sentinel", self.cache / "_npx/other/node_modules/tool/bin.js",
                 self.entry / "node_modules/unrelated/tool.js", self.entry / "node_modules/.bin/personal-harness.cmd",
                 self.entry / "node_modules/.package-lock.json", self.root / "state/python/python.exe",
                 self.root / "state/tools/mcp.exe", self.root / "profile/.codex/auth.json",
                 self.root / "profile/.codex/config.toml", self.root / "local.toml"]
        for index, filename in enumerate(paths):
            filename.parent.mkdir(parents=True, exist_ok=True)
            filename.write_bytes(f"isolated-sentinel-{index}".encode())
        return {filename: filename.read_bytes() for filename in paths}

    def assert_preserved(self, sentinels):
        for filename, content in sentinels.items():
            self.assertEqual(filename.read_bytes(), content, "An unrelated fixture was modified")

    def run_launcher(self, args, expected=0, environment=None, package=None):
        result = subprocess.run([NODE, str((package or self.package) / "bin/personal-harness.mjs"), *args],
                                cwd=self.caller, env=environment or self.environment,
                                capture_output=True, timeout=30)
        self.assertEqual(result.returncode, expected, result.stderr.decode(errors="replace"))
        return result

    def calls(self):
        return [json.loads(line) for line in self.log.read_text(encoding="utf-8-sig").splitlines()]

    def test_cleanup_success_failure_help_and_bad_arguments(self):
        cases = [(["install", "--home", "profile's [x] & $()", "--locked"], 0, "0"),
                 (["update"], 43, "43"), (["--help"], 0, "0"),
                 (["install", "--help"], 0, "0"), ([], 0, "0"),
                 (["bad"], 1, "0"), (["install", "--unknown"], 1, "0"),
                 (["install", "--home"], 1, "0")]
        for args, code, child_code in cases:
            with self.subTest(arguments=args):
                self.prepare_entry()
                sentinels = self.sentinels()
                metadata = {filename: filename.read_bytes() for filename in
                            [self.entry / "package.json", self.entry / "package-lock.json"]}
                result = self.run_launcher(args, expected=code,
                                           environment=dict(self.environment, LAUNCHER_EXIT=child_code))
                self.assertFalse(self.package.exists())
                self.assertFalse((self.entry / ".personal-harness-source.lease").exists())
                self.assert_preserved(sentinels | metadata)
                if b"Usage:" in result.stdout:
                    self.assertNotIn(b"releases are retained", result.stdout)
        first = self.calls()[0]
        self.assertEqual(set(first), {"command", "options", "sourceRoot", "cwd"})
        self.assertEqual(first["options"], {"home": "profile's [x] & $()", "locked": True})
        self.assertEqual(Path(first["cwd"]), self.caller)

    def test_checkout_and_direct_execution_are_preserved(self):
        checkout = self.root / "checkout"
        self.write_package(checkout)
        self.run_launcher(["install"], package=checkout)
        self.assertTrue((checkout / "bin/personal-harness.mjs").exists())
        self.prepare_entry()
        direct = dict(self.environment)
        del direct["npm_command"]
        self.run_launcher(["update"], environment=direct)
        self.assertTrue(self.package.exists())

    def test_effective_cache_comes_from_npm_configuration(self):
        self.prepare_entry()
        self.npmrc.write_text(f"cache={self.cache.as_posix()}\n", encoding="utf-8")
        environment = dict(self.environment)
        del environment["npm_config_cache"]
        self.run_launcher(["install"], environment=environment)
        self.assertFalse(self.package.exists())

    def test_unverified_ownership_is_refused_without_starting_child(self):
        mutations = [
            (self.entry / "package.json", lambda value: value["_npx"].update(packages=["other"])),
            (self.entry / "package.json", lambda value: value["_npx"].update(packages=SPEC)),
            (self.entry / "package.json", lambda value: value["dependencies"].update({NAME: "file:other"})),
            (self.entry / "package-lock.json", lambda value: value["packages"][RELATIVE].update(resolved=SPEC.replace("tttaliesin", "other") + "#" + "a" * 40)),
            (self.entry / "package-lock.json", lambda value: value["packages"][RELATIVE]["bin"].update({"personal-harness": "other.mjs"})),
            (self.package / "package.json", lambda value: value.update(name="other")),
            (self.package / "package.json", lambda value: value["bin"].update({"personal-harness": "other.mjs"})),
        ]
        self.prepare_entry()
        for filename, mutate in mutations:
            with self.subTest(metadata=filename.name):
                original = filename.read_bytes()
                value = json.loads(original)
                mutate(value)
                filename.write_text(json.dumps(value), encoding="utf-8")
                self.run_launcher(["install"], expected=1)
                self.assertTrue(self.package.exists())
                self.assertFalse(self.log.exists())
                filename.write_bytes(original)
        self.run_launcher(["install"], expected=1,
                          environment=dict(self.environment, npm_config_cache=str(self.root / "other-cache")))
        self.assertTrue(self.package.exists())
        self.assertFalse(self.log.exists())

    def test_stale_lease_is_preserved_and_refused(self):
        self.prepare_entry()
        lease = self.entry / ".personal-harness-source.lease"
        lease.mkdir()
        owner = lease / "owner"
        owner.write_bytes(b"unknown-owner")
        self.run_launcher(["install"], expected=1)
        self.assertEqual(owner.read_bytes(), b"unknown-owner")
        self.assertTrue(self.package.exists())
        self.assertFalse(self.log.exists())

    def test_hardlinked_package_member_is_preserved(self):
        self.prepare_entry()
        external = self.root / "linked-file"
        external.write_bytes(b"keep")
        os.link(external, self.package / "linked-file")
        result = self.run_launcher(["install"], expected=1)
        self.assertIn(b"cleanup failed", result.stderr)
        self.assertEqual(external.read_bytes(), b"keep")
        self.assertTrue(self.package.exists())

    def test_cleanup_failure_preserves_primary_child_exit(self):
        for child_code in ("0", "43"):
            with self.subTest(child_code=child_code):
                self.prepare_entry()
                result = self.run_launcher(["update"], expected=int(child_code) or 1,
                                           environment=dict(self.environment, LAUNCHER_EXIT=child_code,
                                                            LAUNCHER_MUTATE="1"))
                self.assertIn(b"cleanup failed", result.stderr)
                self.assertTrue(self.package.exists())
                self.assertFalse((self.entry / ".personal-harness-source.lease").exists())
                self.assertTrue(self.package.resolve().is_relative_to(self.root))
                shutil.rmtree(self.package)

    def test_package_junction_and_linked_descendants_are_preserved(self):
        self.prepare_entry()
        original = self.package.with_name("saved")
        self.package.rename(original)
        result = subprocess.run(["cmd.exe", "/d", "/c", "mklink", "/J", str(self.package), str(original)],
                                capture_output=True)
        self.assertEqual(result.returncode, 0)
        try:
            self.run_launcher(["install"], expected=1)
            self.assertFalse(self.log.exists())
            self.assertTrue((original / "package.json").exists())
        finally:
            self.package.rmdir()
        original.rename(self.package)
        foreign = self.root / "foreign"
        foreign.mkdir()
        sentinel = foreign / "keep"
        sentinel.write_bytes(b"keep")
        try:
            result = self.run_launcher(["install"], expected=1,
                                       environment=dict(self.environment, LAUNCHER_LINK=str(foreign)))
            self.assertIn(b"cleanup failed", result.stderr)
            self.assertEqual(sentinel.read_bytes(), b"keep")
            self.assertTrue(self.package.exists())
        finally:
            junction = self.package / "foreign"
            if junction.exists():
                junction.rmdir()

    def test_windows_delete_error_preserves_primary_child_exit(self):
        self.prepare_entry()
        locked = self.package / "locked-source"
        with locked.open("wb"):
            result = self.run_launcher(["update"], expected=43,
                                       environment=dict(self.environment, LAUNCHER_EXIT="43"))
            self.assertIn(b"cleanup failed", result.stderr)
            self.assertTrue(locked.exists())
        self.assertFalse((self.entry / ".personal-harness-source.lease").exists())

    def test_peer_lease_refuses_second_child_and_preserves_source(self):
        self.prepare_entry()
        gate = self.root / "gate"
        process = subprocess.Popen([NODE, str(self.package / "bin/personal-harness.mjs"), "install"],
                                   cwd=self.caller, env=dict(self.environment, LAUNCHER_GATE=str(gate)),
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 20
            while not gate.with_suffix(".entered").exists():
                if process.poll() is not None or time.monotonic() > deadline:
                    self.fail("First child did not reach its lease-protected gate")
                time.sleep(0.03)
            second = self.run_launcher(["update"], expected=1)
            self.assertIn(b"lease is unavailable", second.stderr)
            self.assertTrue(self.package.exists())
            self.assertEqual(len(self.calls()), 1)
        finally:
            gate.write_text("release", encoding="utf-8")
            _, stderr = process.communicate(timeout=30)
        self.assertEqual(process.returncode, 0, stderr.decode(errors="replace"))
        self.assertFalse(self.package.exists())

    def test_exact_public_npx_git_install_and_update_rehydrate(self):
        repo = self.root / "git-fixture"
        self.write_package(repo)
        for args in (["init", "--quiet"], ["add", "."], ["commit", "--quiet", "-m", "fixture"]):
            result = subprocess.run([GIT, "-C", str(repo), "-c", "user.name=Fixture",
                                     "-c", "user.email=fixture@example.invalid", *args],
                                    env=self.environment, capture_output=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace"))
        environment = dict(self.environment, GIT_CONFIG_COUNT="3")
        for index, prefix in enumerate(["https://github.com/tttaliesin/personal-harness.git",
                                        "ssh://git@github.com/tttaliesin/personal-harness.git",
                                        "git@github.com:tttaliesin/personal-harness.git"]):
            environment[f"GIT_CONFIG_KEY_{index}"] = f"url.{repo.as_uri()}.insteadOf"
            environment[f"GIT_CONFIG_VALUE_{index}"] = prefix
        sentinels = self.sentinels()
        prior_metadata = None
        for command in ("install", "update"):
            result = subprocess.run([NPX, "--yes", "--prefer-online", SPEC, command], cwd=self.caller,
                                    env=environment, capture_output=True, timeout=90)
            self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace"))
            calls = self.calls()
            self.assertEqual(calls[-1]["command"], command)
            unpacked = Path(calls[-1]["sourceRoot"])
            self.assertFalse(unpacked.exists(), "Real npx unpacked source survived")
            actual_entry = unpacked.parents[2]
            self.assertEqual(actual_entry.parent, self.cache / "_npx")
            metadata = {filename: filename.read_bytes() for filename in
                        [actual_entry / "package.json", actual_entry / "package-lock.json",
                         actual_entry / "node_modules/.package-lock.json",
                         actual_entry / "node_modules/.bin/personal-harness.cmd"]}
            if prior_metadata is not None:
                self.assert_preserved(prior_metadata)
                self.assertEqual(Path(calls[-2]["sourceRoot"]), unpacked)
            prior_metadata = metadata
            self.assert_preserved(sentinels)
            self.assertTrue((self.cache / "_cacache/index-v5").is_dir())
            self.assertFalse((actual_entry / ".personal-harness-source.lease").exists())


if __name__ == "__main__":
    unittest.main()
