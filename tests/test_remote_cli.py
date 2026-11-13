import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
from tempfile import TemporaryDirectory
import time
import unittest


ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
POWERSHELL = shutil.which("powershell.exe")
NPM = shutil.which("npm.cmd")
WINDOWS = os.name == "nt" and NODE and POWERSHELL

PYTHON_STUB = r'''
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
class FixturePython {
    static int Main(string[] arguments) {
        AppContext.SetSwitch("Switch.System.IO.UseLegacyPathHandling", false);
        AppContext.SetSwitch("Switch.System.IO.BlockLongPaths", false);
        try { return Run(arguments); }
        catch (Exception error) { Console.Error.WriteLine(error.GetType().Name + ": " + error.Message); return 93; }
    }
    static int Run(string[] arguments) {
        string self = System.Reflection.Assembly.GetExecutingAssembly().Location;
        var record = new List<string>(); record.Add(self); record.AddRange(arguments);
        File.AppendAllText(Environment.GetEnvironmentVariable("HARNESS_FIXTURE_PYTHON_LOG"),
            Convert.ToBase64String(Encoding.UTF8.GetBytes(String.Join("\0", record))) + "\n");
        var args = new List<string>(arguments);
        if (args.Count > 0 && args[0] == "-3") args.RemoveAt(0);
        if (args.Count > 1 && args[0] == "-c") {
            if (args[1].Contains("sys.executable")) Console.WriteLine(self);
            if (args[1].Contains("version_info") && Environment.GetEnvironmentVariable("HARNESS_FIXTURE_OLD_PYTHON") == "1") return 17;
            if (args[1].Contains("import tomlkit")) return Code("HARNESS_FIXTURE_IMPORT_EXIT");
            return 0;
        }
        if (args.Count == 3 && args[0] == "-m" && args[1] == "venv") {
            string target = @"\\?\" + args[2]; Directory.CreateDirectory(target);
            string attempt = Path.Combine(target, "fixture-attempt");
            if (Environment.GetEnvironmentVariable("HARNESS_FIXTURE_INCOMPLETE_VENV") == "1" && !File.Exists(attempt)) {
                File.WriteAllText(attempt, "incomplete"); return 29;
            }
            Directory.CreateDirectory(Path.Combine(target, "Scripts"));
            File.Copy(self, Path.Combine(target, "Scripts", "python.exe"), true);
            File.WriteAllText(Path.Combine(target, "pyvenv.cfg"), "fixture");
            return 0;
        }
        if (args.Count >= 3 && args[0] == "-m" && args[1] == "pip" && args[2] == "install") return Code("HARNESS_FIXTURE_PIP_EXIT");
        return 91;
    }
    static int Code(string name) {
        string value = Environment.GetEnvironmentVariable(name);
        return String.IsNullOrEmpty(value) ? 0 : Int32.Parse(value);
    }
}
'''

UPDATE_STUB = r'''
param([switch]$Install,[switch]$Locked,[string]$HostName,[string]$CodexHome,[string]$Codex,
    [string]$LocalConfig,[string]$HomeDirectory,[string]$Python,[string]$StateRoot)
$record = @{kind='wrapper';install=[bool]$Install;locked=[bool]$Locked;host_name=$HostName;
    codex_home=$CodexHome;codex=$Codex;local_config=$LocalConfig;home=$HomeDirectory;
    python=$Python;state=$StateRoot;source=(Split-Path $PSScriptRoot -Parent)}
[IO.File]::AppendAllText($env:HARNESS_FIXTURE_LOG, (($record | ConvertTo-Json -Compress) + "`n"))
if ($env:HARNESS_FIXTURE_GATE) {
    [IO.File]::WriteAllText(($env:HARNESS_FIXTURE_GATE + '.entered'), 'held')
    while (-not [IO.File]::Exists($env:HARNESS_FIXTURE_GATE)) { Start-Sleep -Milliseconds 30 }
}
foreach ($kind in @('dependencies', 'apply', 'check')) {
    [IO.File]::AppendAllText($env:HARNESS_FIXTURE_LOG, ((@{kind=$kind} | ConvertTo-Json -Compress) + "`n"))
    if ($env:HARNESS_FIXTURE_FAIL_STAGE -eq $kind) { exit 43 }
}
if ($env:HARNESS_FIXTURE_MUTATE_SOURCE) {
    [IO.File]::AppendAllText((Join-Path (Split-Path $PSScriptRoot -Parent) 'README.md'), 'mutation')
}
exit 0
'''


@unittest.skipUnless(WINDOWS, "Windows PowerShell and Node are required")
class RemoteCliTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        scratch = ROOT / ".local"
        scratch.mkdir(exist_ok=True)
        cls.compiler_directory = TemporaryDirectory(prefix="cli-compiler-", dir=scratch)
        directory = Path(cls.compiler_directory.name)
        compiler = Path(os.environ["SystemRoot"]) / "Microsoft.NET/Framework64/v4.0.30319/csc.exe"
        if not compiler.exists():
            raise unittest.SkipTest("The Windows .NET Framework C# compiler is required for executable fixtures")
        source = directory / "fixture.cs"
        source.write_text(PYTHON_STUB, encoding="utf-8")
        cls.python_stub = directory / "fixture-python.exe"
        result = subprocess.run([str(compiler), "/nologo", "/target:exe", f"/out:{cls.python_stub}", str(source)],
                                capture_output=True, text=True)
        if result.returncode:
            raise AssertionError(result.stdout + result.stderr)

    @classmethod
    def tearDownClass(cls):
        cls.compiler_directory.cleanup()

    def setUp(self):
        self.directory = TemporaryDirectory(prefix="remote-cli-", dir=ROOT / ".local")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.assertTrue(self.root.resolve().is_relative_to(ROOT.resolve()))
        self.directory.name = "\\\\?\\" + str(self.root)
        self.payload = self.root / "payload's [source] & $() 한글"
        self.payload.mkdir()
        manifest = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        for relative in ["package.json", "README.md", *manifest["files"]]:
            if relative.startswith("!"):
                continue
            source = ROOT / relative
            destination = self.payload / relative
            if source.is_dir():
                shutil.copytree(source, destination, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
        (self.payload / "scripts/update-dependencies.ps1").write_text(UPDATE_STUB, encoding="utf-8")
        self.caller = self.root / "c"
        self.caller.mkdir()
        self.python = self.root / "python's [exe] & $().exe"
        shutil.copy2(self.python_stub, self.python)
        self.home = self.caller / "h"
        self.manager = self.home / ".local/share/personal-harness"
        self.state = self.manager / "state"
        self.log = self.root / "wrapper.jsonl"
        self.python_log = self.root / "python.log"
        self.environment = dict(os.environ, USERPROFILE=str(self.root / "default-home"),
                                LOCALAPPDATA=str(self.root / "local-appdata"),
                                CODEX_HOME=str(self.root / "default-codex"), COMPUTERNAME="ROYLABS-DESKTOP",
                                HARNESS_FIXTURE_LOG=str(self.log), HARNESS_FIXTURE_PYTHON_LOG=str(self.python_log))
        for key in list(self.environment):
            if key.startswith("HARNESS_FIXTURE_") and key not in ("HARNESS_FIXTURE_LOG", "HARNESS_FIXTURE_PYTHON_LOG"):
                del self.environment[key]

    def arguments(self, command="install", extra=(), home=True, python=True):
        args = [NODE, str(self.payload / "bin/personal-harness.mjs"), command]
        if home:
            args += ["--home", self.home.name]
        if python:
            args += ["--python", str(self.python)]
        return args + list(extra)

    def run_cli(self, command="install", extra=(), home=True, python=True, expected=0, environment=None):
        result = subprocess.run(self.arguments(command, extra, home, python), cwd=self.caller,
                                env=environment or self.environment, capture_output=True, timeout=30)
        self.assertEqual(result.returncode, expected, (result.stdout + result.stderr).decode("utf-8", errors="replace"))
        return result

    def calls(self):
        return [json.loads(line) for line in self.log.read_text(encoding="utf-8-sig").splitlines()]

    def python_calls(self):
        return [base64.b64decode(line).decode("utf-8").split("\0") for line in self.python_log.read_text().splitlines()]

    def receipt(self, manager=None):
        return json.loads(((manager or self.manager) / "active.json").read_text(encoding="utf-8"))

    def test_literal_paths_wrapper_order_and_success_receipt(self):
        self.caller = self.root / "caller's [cwd] & $() 한글"
        self.caller.mkdir()
        self.home = self.caller / "profile's [x] & $() ; # 한글"
        self.manager = self.root / "m"
        self.state = self.manager / "state"
        self.run_cli(extra=["--install-root", str(self.manager), "--locked", "--local-config", "config's [x] & $().toml",
                            "--codex", "tools/codex's [x].exe"])
        calls = self.calls()
        self.assertEqual([call["kind"] for call in calls], ["wrapper", "dependencies", "apply", "check"])
        wrapper = calls[0]
        self.assertTrue(wrapper["install"])
        self.assertTrue(wrapper["locked"])
        self.assertEqual(Path(wrapper["home"]), self.home)
        self.assertEqual(Path(wrapper["codex_home"]), self.home / ".codex")
        self.assertEqual(Path(wrapper["local_config"]), self.caller / "config's [x] & $().toml")
        self.assertEqual(Path(wrapper["codex"]), self.caller / "tools/codex's [x].exe")
        self.assertEqual(wrapper["host_name"], "roylabs-desktop")
        receipt = self.receipt()
        self.assertEqual(Path(receipt["state_root"]), self.state)
        self.assertEqual(Path(receipt["python"]).parent.parent.parent, self.state / "python")
        release = Path(receipt["source_root"])
        self.assertEqual(release.parent, self.manager / "releases")
        self.assertEqual(release.name, receipt["payload_sha256"])
        self.assertTrue((release / "skills/agent-desktop/references/commands-system.md").is_file())
        self.assertTrue((release / "sources/agent-desktop-LICENSE").is_file())
        self.assertFalse((release / "scripts/test.ps1").exists())
        self.assertFalse((release / "AGENTS.md").exists())
        self.assertFalse((release / "Taskfile.yml").exists())
        self.assertFalse((release / "__pycache__").exists())

    def test_default_targets_and_explicit_manager_state_and_codex_home(self):
        self.run_cli(home=False)
        default_manager = self.root / "local-appdata/PersonalHarness"
        default = self.receipt(default_manager)
        self.assertEqual(Path(default["home"]), self.root / "default-home")
        self.assertEqual(Path(default["codex_home"]), self.root / "default-codex")
        self.run_cli(extra=["--install-root", "manager [custom]", "--state-root", "state [custom]",
                            "--codex-home", "codex [custom]", "--host", "HOMELAB-DESKTOP"])
        receipt = self.receipt(self.caller / "manager [custom]")
        self.assertEqual(Path(receipt["state_root"]), self.caller / "state [custom]")
        self.assertEqual(Path(receipt["codex_home"]), self.caller / "codex [custom]")
        self.assertEqual(receipt["host_name"], "homelab-desktop")

    def test_two_payloads_preserve_core_state_and_reuse_requirements_venv(self):
        self.run_cli()
        first = self.receipt()
        preserved = {}
        for relative in ("sources/dependencies.lock.json", "skills/agent-desktop/SKILL.md", "tools/agent.exe", "roylabs-desktop.toml"):
            target = self.state / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"core-owned content\x00\xff")
            preserved[target] = target.read_bytes()
        (self.payload / "docs/coordinator-added.md").write_text("new payload\n", encoding="utf-8")
        self.run_cli("update")
        second = self.receipt()
        self.assertNotEqual(first["payload_sha256"], second["payload_sha256"])
        self.assertEqual(first["python"], second["python"])
        self.assertTrue(Path(first["source_root"]).is_dir())
        self.assertTrue((Path(second["source_root"]) / "docs/coordinator-added.md").is_file())
        self.assertEqual({path: path.read_bytes() for path in preserved}, preserved)
        pip = [call for call in self.python_calls() if call[1:4] == ["-m", "pip", "install"]]
        self.assertEqual(len(pip), 1)
        self.assertFalse((self.state / "sources/agent-desktop-LICENSE").exists())

    def test_requirements_identity_selects_a_new_persistent_venv(self):
        self.run_cli()
        first = self.receipt()
        requirements = self.payload / "requirements.txt"
        requirements.write_bytes(requirements.read_bytes() + b"\n")
        self.run_cli("update")
        second = self.receipt()
        self.assertNotEqual(first["python"], second["python"])
        self.assertTrue(Path(first["python"]).is_file())

    def test_failures_propagate_and_retain_previous_receipt(self):
        self.run_cli()
        previous = (self.manager / "active.json").read_bytes()
        for stage in ("dependencies", "apply", "check"):
            with self.subTest(stage=stage):
                environment = dict(self.environment, HARNESS_FIXTURE_FAIL_STAGE=stage)
                self.run_cli("update", expected=43, environment=environment)
                self.assertEqual((self.manager / "active.json").read_bytes(), previous)
        self.run_cli("update")
        self.assertEqual(self.receipt()["command"], "update")

    def test_pip_failure_has_no_readiness_or_receipt_and_can_retry(self):
        self.run_cli(expected=37, environment=dict(self.environment, HARNESS_FIXTURE_PIP_EXIT="37"))
        self.assertFalse((self.manager / "active.json").exists())
        self.assertFalse(list(self.state.glob("python/*/ready.json")))
        self.assertFalse(self.log.exists())
        self.run_cli()
        self.assertEqual(len(list(self.state.glob("python/*/ready.json"))), 1)

    def test_import_failure_has_no_readiness_or_receipt(self):
        self.run_cli(expected=33, environment=dict(self.environment, HARNESS_FIXTURE_IMPORT_EXIT="33"))
        self.assertFalse(list(self.state.glob("python/*/ready.json")))
        self.assertFalse((self.manager / "active.json").exists())
        self.run_cli()

    def test_incomplete_venv_is_retried_without_cleaning_state(self):
        environment = dict(self.environment, HARNESS_FIXTURE_INCOMPLETE_VENV="1")
        self.run_cli(expected=29, environment=environment)
        self.assertFalse((self.manager / "active.json").exists())
        self.run_cli(environment=environment)
        self.assertTrue(list(self.state.glob("python/*/fixture-attempt")))

    def test_bad_release_is_rejected_before_any_child_install(self):
        self.run_cli()
        previous = (self.manager / "active.json").read_bytes()
        release = Path(self.receipt()["source_root"])
        before = len(self.calls())
        (release / "common/config.toml").unlink()
        self.run_cli("update", expected=1)
        self.assertEqual(len(self.calls()), before)
        self.assertEqual((self.manager / "active.json").read_bytes(), previous)

    def test_source_mutation_after_check_cannot_advance_receipt(self):
        self.run_cli()
        previous = (self.manager / "active.json").read_bytes()
        self.run_cli("update", expected=1, environment=dict(self.environment, HARNESS_FIXTURE_MUTATE_SOURCE="1"))
        self.assertEqual((self.manager / "active.json").read_bytes(), previous)

    def test_invalid_python_is_not_silently_replaced(self):
        result = self.run_cli(extra=["--python", "missing.exe"], python=False, expected=1)
        self.assertIn(b"Invalid --python", result.stderr)
        self.assertFalse(self.manager.exists())

    def test_windowsapps_alias_is_ignored_and_missing_python_is_actionable(self):
        aliases = self.root / "Microsoft/WindowsApps"
        aliases.mkdir(parents=True)
        shutil.copy2(self.python, aliases / "python.exe")
        environment = dict(self.environment, PATH=str(aliases))
        result = self.run_cli(python=False, expected=1, environment=environment)
        self.assertIn(b"Python 3.11+", result.stderr)
        self.assertIn(b"--python", result.stderr)
        self.assertFalse(self.python_log.exists())
        self.assertFalse(self.manager.exists())
        result = self.run_cli(extra=["--python", str(aliases / "python.exe")], python=False, expected=1)
        self.assertIn(b"WindowsApps", result.stderr)

    def test_path_python_and_windows_launcher_discovery(self):
        commands = self.root / "commands"
        commands.mkdir()
        launcher = commands / "py.exe"
        shutil.copy2(self.python, launcher)
        self.run_cli(python=False, environment=dict(self.environment, PATH=str(commands)))
        self.assertTrue(any(call[1] == "-3" for call in self.python_calls()))
        launcher.unlink()
        shutil.copy2(self.python, commands / "python.exe")
        self.run_cli(python=False, environment=dict(self.environment, PATH=str(commands)))

    def test_old_python_fails_before_mutation(self):
        result = self.run_cli(expected=1, environment=dict(self.environment, HARNESS_FIXTURE_OLD_PYTHON="1"))
        self.assertIn(b"Python 3.11+", result.stderr)
        self.assertFalse(self.manager.exists())

    def test_invalid_host_and_cli_options_do_not_write(self):
        for extra in (["--host", "../outside"], ["--host", "missing"], ["--unknown"], ["--state-root"], ["--locked", "--locked"]):
            with self.subTest(extra=extra):
                self.run_cli(extra=extra, expected=1)
                self.assertFalse(self.manager.exists())
        for args in ([], ["--help"], ["install", "--help"]):
            result = subprocess.run([NODE, str(self.payload / "bin/personal-harness.mjs"), *args], cwd=self.caller,
                                    env=self.environment, capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 0)
            self.assertIn(b"Usage:", result.stdout)
        self.assertFalse(self.manager.exists())

    def test_unsafe_persistent_roots_and_allowlist_are_rejected(self):
        for flags in (["--install-root", str(self.payload / "manager")],
                      ["--state-root", str(self.payload / "state")],
                      ["--state-root", str(self.manager / "releases/state")],
                      ["--state-root", str(self.root)]):
            with self.subTest(flags=flags):
                self.run_cli(extra=flags, expected=1)
                self.assertFalse(self.manager.exists())
        manifest_path = self.payload / "package.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["files"].append("../outside")
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        self.run_cli(expected=1)
        self.assertFalse(self.manager.exists())

    def junction(self, link, destination):
        script = "New-Item -ItemType Junction -Path $env:HARNESS_FIXTURE_LINK -Target $env:HARNESS_FIXTURE_DESTINATION | Out-Null"
        environment = dict(self.environment, HARNESS_FIXTURE_LINK=str(link), HARNESS_FIXTURE_DESTINATION=str(destination))
        result = subprocess.run([POWERSHELL, "-NoProfile", "-NonInteractive", "-Command", script],
                                env=environment, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.addCleanup(lambda: os.rmdir(link) if link.exists() else None)

    def test_junctions_in_payload_and_managed_paths_are_rejected(self):
        outside = self.root / "outside"
        outside.mkdir()
        link = self.payload / "docs/linked"
        self.junction(link, outside)
        self.run_cli(expected=1)
        self.assertFalse(self.manager.exists())
        os.rmdir(link)
        managed = self.caller / "linked-manager"
        self.junction(managed, outside)
        self.run_cli(extra=["--install-root", str(managed)], expected=1)
        self.assertFalse(list(outside.iterdir()))

    def test_existing_release_junction_is_rejected_without_traversal(self):
        self.run_cli()
        release = Path(self.receipt()["source_root"])
        outside = self.root / "outside"
        outside.mkdir()
        self.junction(release / "unexpected-link", outside)
        before = len(self.calls())
        self.run_cli("update", expected=1)
        self.assertEqual(len(self.calls()), before)

    def test_normal_concurrency_locks_manager_state_and_both_targets(self):
        gate = self.root / "gate"
        environment = dict(self.environment, HARNESS_FIXTURE_GATE=str(gate))
        first = subprocess.Popen(self.arguments(), cwd=self.caller, env=environment,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 15
            while not gate.with_suffix(".entered").exists() and first.poll() is None and time.monotonic() < deadline:
                time.sleep(0.03)
            self.assertTrue(gate.with_suffix(".entered").exists(), "First bootstrap did not reach its held wrapper")
            variants = [[], ["--install-root", "other-manager", "--state-root", str(self.state)],
                        ["--install-root", "other-manager", "--state-root", "other-state"],
                        ["--home", "other-home", "--install-root", "other-manager", "--codex-home", str(self.home / ".codex")]]
            for index, flags in enumerate(variants):
                with self.subTest(resource=index):
                    if index == 3:
                        result = self.run_cli(extra=flags, home=False, expected=1)
                    else:
                        result = self.run_cli(extra=flags, expected=1)
                    self.assertIn(b"already running", result.stderr)
            self.assertFalse((self.manager / "active.json").exists())
        finally:
            gate.write_text("release", encoding="utf-8")
            stdout, stderr = first.communicate(timeout=15)
        self.assertEqual(first.returncode, 0, stdout + stderr)
        self.run_cli("update")

    @unittest.skipUnless(NPM, "npm is required")
    def test_actual_npm_pack_has_complete_allowlisted_payload_and_runs_offline(self):
        for relative in ("AGENTS.md", ".local/private.txt", ".audit/private.txt", "tests/private.py",
                         "scripts/__pycache__/private.pyc", "skills/agent-desktop/.local/private.txt"):
            path = self.payload / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("private sentinel", encoding="utf-8")
        shutil.copy2(ROOT / ".gitignore", self.payload / ".gitignore")
        destination = self.root / "packed"
        destination.mkdir()
        result = subprocess.run([NPM, "pack", "--json", "--ignore-scripts", "--offline", "--cache", str(self.root / "npm-cache"),
                                 "--pack-destination", str(destination)], cwd=self.payload, env=self.environment,
                                capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        package = json.loads(result.stdout)[0]
        files = {item["path"] for item in package["files"]}
        for name in ("skills/agent-desktop/references/commands-system.md", "skills/agent-desktop-windows/references/troubleshooting.md",
                     "sources/agent-desktop-LICENSE", "docs/deployment.md", "scripts/bootstrap.ps1"):
            self.assertIn(name, files)
        self.assertNotIn("scripts/test.ps1", files)
        self.assertNotIn("Taskfile.yml", files)
        self.assertNotIn("AGENTS.md", files)
        self.assertFalse(any(set(name.split("/")) & {".local", ".audit", ".git", "tests", "__pycache__"} for name in files))
        unpacked = self.root / "unpacked"
        with tarfile.open(destination / package["filename"]) as archive:
            archive.extractall(unpacked, filter="data")
        self.payload = unpacked / "package"
        self.run_cli()
        release = Path(self.receipt()["source_root"])
        long_release = Path("\\\\?\\" + str(release))
        actual = {path.relative_to(long_release).as_posix() for path in long_release.rglob("*") if path.is_file()}
        self.assertEqual(actual, files)
        for name in actual:
            self.assertEqual((long_release / name).read_bytes(), (self.payload / name).read_bytes())
        manifest = json.loads((release / "package.json").read_text())
        self.assertTrue(manifest["private"])
        self.assertEqual(manifest["engines"]["node"], ">=22")
        self.assertNotIn("scripts", manifest)
        self.assertNotIn("dependencies", manifest)


if __name__ == "__main__":
    unittest.main()
