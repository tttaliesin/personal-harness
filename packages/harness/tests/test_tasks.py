import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest


ROOT = Path(__file__).resolve().parents[3]
HARNESS = Path("packages/harness")
TASK = shutil.which("task")
PARAMETERS = """param([string]$Command,[switch]$Install,[switch]$Locked,[string]$HostName,[string]$HomeDirectory,[string]$CodexHome,[string]$LocalConfig,[string]$Codex,[string]$Python)
$record = @{script=$MyInvocation.MyCommand.Name;command=$Command;install=[bool]$Install;locked=[bool]$Locked;host_name=$HostName;home_directory=$HomeDirectory;codex_home=$CodexHome;local_config=$LocalConfig;codex=$Codex;python=$Python;cwd=(Get-Location).Path}
$record | ConvertTo-Json -Compress | Add-Content -LiteralPath (Join-Path $PSScriptRoot 'calls.jsonl') -Encoding UTF8
if ($env:HARNESS_TASK_TEST_EXIT) { exit [int]$env:HARNESS_TASK_TEST_EXIT }
exit 0
"""


@unittest.skipUnless(os.name == "nt" and TASK, "Windows and Task are required")
class TaskCommandTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory(prefix="root-task-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / "repository's root with spaces"
        self.installer = self.root / HARNESS / "installer"
        self.installer.mkdir(parents=True)
        shutil.copy2(ROOT / "Taskfile.yml", self.root)
        for name in ("harness.ps1", "update-dependencies.ps1"):
            (self.installer / name).write_text(PARAMETERS, encoding="utf-8")
        self.calls = self.installer / "calls.jsonl"

    def run_task(self, *arguments, cwd=None, environment=None):
        return subprocess.run([TASK, *arguments], cwd=cwd or self.root, env=environment,
                              capture_output=True, text=True, encoding="utf-8", timeout=30)

    def records(self):
        if not self.calls.exists():
            return []
        return [json.loads(line.lstrip("\ufeff")) for line in self.calls.read_text(encoding="utf-8-sig").splitlines()]

    def test_default_help_lists_commands_without_calling_workflow_scripts(self):
        completed = self.run_task()
        self.assertEqual(completed.returncode, 0, completed.stderr)
        for name in ("setup", "plan", "check", "apply", "update", "test"):
            self.assertIn(name, completed.stdout)
        self.assertEqual(self.records(), [])

    def test_subdirectory_invocation_preserves_target_and_python_arguments(self):
        nested = self.root / "nested directory"
        nested.mkdir()
        python = "D:/O'Brien/Python Tools/python.exe"
        home = "D:/O'Brien/A & B/Profile"
        codex = "D:/Codex $literal/Home"
        config = "D:/O'Brien/A & B/local.toml"
        completed = self.run_task("plan", "HOST=roylabs-desktop", f"PYTHON={python}", "--",
                                  "-HomeDirectory", home, "-CodexHome", codex, "-LocalConfig", config, cwd=nested)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        record, = self.records()
        self.assertEqual(record["command"], "plan")
        self.assertEqual(record["host_name"], "roylabs-desktop")
        self.assertEqual(record["python"], python)
        self.assertEqual(record["home_directory"], home)
        self.assertEqual(record["codex_home"], codex)
        self.assertEqual(record["local_config"], config)
        self.assertEqual(Path(record["cwd"]), self.root)

    def test_install_and_update_write_only_when_the_command_requests_installation(self):
        for command, install in (("update:plan", False), ("install:plan", False),
                                 ("install", True), ("update", True)):
            with self.subTest(command=command):
                completed = self.run_task(command, "--", "-Locked", "-Codex", "D:/O'Brien/Codex App/codex.exe")
                self.assertEqual(completed.returncode, 0, completed.stderr)
                record = self.records()[-1]
                self.assertEqual(record["script"], "update-dependencies.ps1")
                self.assertEqual(record["install"], install)
                self.assertTrue(record["locked"])
                self.assertEqual(record["codex"], "D:/O'Brien/Codex App/codex.exe")

    def test_check_and_apply_reach_harness_and_preserve_failure(self):
        for command in ("check", "apply"):
            with self.subTest(command=command):
                completed = self.run_task(command)
                self.assertEqual(completed.returncode, 0, completed.stderr)
                record = self.records()[-1]
                self.assertEqual(record["script"], "harness.ps1")
                self.assertEqual(record["python"], str(self.root / ".venv/Scripts/python.exe"))
        environment = dict(os.environ, HARNESS_TASK_TEST_EXIT="23")
        completed = self.run_task("--exit-code", "check", environment=environment)
        self.assertEqual(completed.returncode, 23, completed.stderr)

    def test_test_runs_python_from_repository_root_and_preserves_failure(self):
        suites = {"test_marketplace_fixture": Path("tests"), "test_harness_fixture": HARNESS / "tests"}
        for module, relative in suites.items():
            tests = self.root / relative
            tests.mkdir(parents=True)
            (tests / f"{module}.py").write_text(
                f"""from pathlib import Path
import unittest

class FixtureTest(unittest.TestCase):
    def test_repository_root(self):
        self.assertEqual(Path.cwd(), Path(__file__).resolve().parents[{len(relative.parts)}])

    def test_nonzero_exit(self):
        self.fail("fixture failure")
""",
                encoding="utf-8",
            )
        shutil.copy2(ROOT / "tests/__init__.py", self.root / "tests")
        arguments = ("test", f"PYTHON={sys.executable}", "--", "-k")
        for module, relative in suites.items():
            with self.subTest(suite=relative.as_posix()):
                tests = self.root / relative
                passed = self.run_task(*arguments, f"{module}.FixtureTest.test_repository_root", cwd=tests)
                self.assertEqual(passed.returncode, 0, passed.stderr)
                self.assertIn("Ran 1 test", passed.stderr)
                failed = self.run_task("--exit-code", *arguments, f"{module}.FixtureTest.test_nonzero_exit", cwd=tests)
                self.assertEqual(failed.returncode, 1, failed.stderr)
                self.assertIn("fixture failure", failed.stderr)
        self.assertEqual(self.records(), [])


if __name__ == "__main__":
    unittest.main()
