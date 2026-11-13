"""Exercise target forwarding through the real PowerShell update entry point."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.name == "nt" and shutil.which("powershell.exe"), "Windows PowerShell is required")
class UpdateCommandTests(unittest.TestCase):
    def test_harness_wrapper_keeps_imported_source_free_of_bytecode(self):
        with TemporaryDirectory() as directory:
            scripts = Path(directory) / 'scripts'
            scripts.mkdir()
            shutil.copy2(ROOT / 'scripts/harness.ps1', scripts)
            (scripts / 'fixture_module.py').write_text('VALUE = 1\n', encoding='utf-8')
            (scripts / 'harness.py').write_text('import fixture_module\nprint(fixture_module.VALUE)\n', encoding='utf-8')
            environment = os.environ.copy()
            environment.pop('PYTHONDONTWRITEBYTECODE', None)
            environment.pop('PYTHONPYCACHEPREFIX', None)
            result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-File',
                                     str(scripts / 'harness.ps1'), 'plan', '-HostName', 'homelab-desktop',
                                     '-Python', sys.executable], env=environment,
                                    capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse((scripts / '__pycache__').exists())

    def run_command(self, extra, install=True, failure=None, use_state=False):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            scripts = root / "scripts"
            scripts.mkdir()
            shutil.copy2(ROOT / "scripts/update-dependencies.ps1", scripts)
            body = '''param([switch]$Install,[switch]$Locked,[string]$HostName,[string]$CodexHome,[string]$Codex,[string]$LocalConfig,[string]$StateRoot,[string]$Python)
$record = @{kind='dependencies';install=[bool]$Install;codex_home=$CodexHome;host_name=$HostName;state_root=$StateRoot}
$record | ConvertTo-Json -Compress | Add-Content -LiteralPath (Join-Path $PSScriptRoot 'calls.jsonl') -Encoding UTF8
exit 0
'''
            scripts.joinpath("install-dependencies.ps1").write_text(body, encoding="utf-8")
            scripts.joinpath("harness.ps1").write_text('''param([string]$Command,[string]$HostName,[string]$CodexHome,[string]$LocalConfig,[string]$HomeDirectory,[string]$StateRoot,[string]$Python)
$record = @{kind=$Command;codex_home=$CodexHome;home_directory=$HomeDirectory;state_root=$StateRoot}
$record | ConvertTo-Json -Compress | Add-Content -LiteralPath (Join-Path $PSScriptRoot 'calls.jsonl') -Encoding UTF8
exit 0
''', encoding="utf-8")
            if failure:
                target = scripts / ("install-dependencies.ps1" if failure == "dependencies" else "harness.ps1")
                text = target.read_text(encoding="utf-8")
                text = text.replace("exit 0", "exit 7" if failure == "dependencies" else
                                    f"if ($Command -eq '{failure}') {{ exit 7 }}\nexit 0")
                target.write_text(text, encoding="utf-8")
            state = root / "state [literal] & $cache's 한글"
            home = root / "user's home"
            arguments = ["powershell.exe", "-NoProfile", "-NonInteractive", "-File", str(scripts/"update-dependencies.ps1"),
                         "-HostName", "homelab-desktop", "-HomeDirectory", str(home)]
            if use_state:
                arguments.extend(["-StateRoot", str(state)])
            if install:
                arguments.append("-Install")
            explicit = root / "separate codex"
            if extra:
                arguments.extend(["-CodexHome", str(explicit)])
            completed = subprocess.run(arguments, capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(completed.returncode, 7 if failure else 0, completed.stderr)
            calls = [json.loads(line.lstrip("\ufeff")) for line in (scripts/"calls.jsonl").read_text(encoding="utf-8-sig").splitlines()]
            self.assertTrue(all(c["state_root"] == (str(state) if use_state else "") for c in calls))
            expected = explicit if extra else home/".codex"
            return calls, str(home), str(expected)

    def test_explicit_home_targets_dependency_install_and_harness_together(self):
        calls, home, expected = self.run_command(False)
        self.assertEqual([c["kind"] for c in calls], ["dependencies", "apply", "check"])
        self.assertTrue(calls[0]["install"])
        self.assertTrue(all(c["codex_home"] == expected for c in calls))
        self.assertTrue(all(c["home_directory"] == home for c in calls[1:]))

    def test_explicit_codex_home_takes_precedence_consistently(self):
        calls, home, expected = self.run_command(True)
        self.assertTrue(all(c["codex_home"] == expected for c in calls))
        self.assertTrue(all(c["home_directory"] == home for c in calls[1:]))

    def test_preview_does_not_apply_or_check(self):
        calls, _, expected = self.run_command(False, install=False)
        self.assertEqual(len(calls), 1)
        self.assertFalse(calls[0]["install"])
        self.assertEqual(calls[0]["codex_home"], expected)

    def test_failures_stop_before_later_phases_and_preserve_exit_code(self):
        for failure, expected in (("dependencies", ["dependencies"]),
                                  ("apply", ["dependencies", "apply"]),
                                  ("check", ["dependencies", "apply", "check"])):
            with self.subTest(failure=failure):
                calls, _, _ = self.run_command(False, failure=failure)
                self.assertEqual([c["kind"] for c in calls], expected)

    def test_state_root_reaches_install_apply_and_check_literally(self):
        for install in (False, True):
            with self.subTest(install=install):
                calls, _, _ = self.run_command(False, install=install, use_state=True)
                self.assertEqual(len(calls), 3 if install else 1)

    def test_core_wrappers_forward_literal_state_and_config_to_python(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            scripts = root / "scripts"
            scripts.mkdir()
            recorder = "import json, pathlib, sys; pathlib.Path(__file__).with_suffix('.json').write_text(json.dumps(sys.argv[1:]))"
            state = str(root / "state [literal] & $cache's 한글")
            config = str(Path(state) / "host's [local].toml")
            for wrapper, module, prefix in (("harness.ps1", "harness.py", ["plan"]),
                                             ("install-dependencies.ps1", "install_dependencies.py", ["-Locked"])):
                with self.subTest(wrapper=wrapper):
                    shutil.copy2(ROOT / "scripts" / wrapper, scripts)
                    (scripts / module).write_text(recorder, encoding="utf-8")
                    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-File",
                                             str(scripts / wrapper), *prefix, "-HostName", "homelab-desktop",
                                             "-StateRoot", state, "-LocalConfig", config, "-Python", sys.executable],
                                            capture_output=True, text=True, encoding="utf-8")
                    self.assertEqual(result.returncode, 0, result.stderr)
                    args = json.loads((scripts / module).with_suffix(".json").read_text())
                    self.assertEqual(args[args.index("--state-root") + 1], state)
                    self.assertEqual(args[args.index("--local-config") + 1], config)
