"""Exercise target forwarding through the real PowerShell update entry point."""
import json
import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.name == "nt" and shutil.which("powershell.exe"), "Windows PowerShell is required")
class UpdateCommandTests(unittest.TestCase):
    def run_command(self, extra, install=True):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            scripts = root / "scripts"
            scripts.mkdir()
            shutil.copy2(ROOT / "scripts/update-dependencies.ps1", scripts)
            body = '''param([switch]$Install,[switch]$Locked,[string]$HostName,[string]$CodexHome,[string]$Codex,[string]$LocalConfig,[string]$Python)
$record = @{kind='dependencies';install=[bool]$Install;codex_home=$CodexHome;host_name=$HostName}
$record | ConvertTo-Json -Compress | Add-Content -LiteralPath (Join-Path $PSScriptRoot 'calls.jsonl') -Encoding UTF8
exit 0
'''
            scripts.joinpath("install-dependencies.ps1").write_text(body, encoding="utf-8")
            scripts.joinpath("harness.ps1").write_text('''param([string]$Command,[string]$HostName,[string]$CodexHome,[string]$LocalConfig,[string]$HomeDirectory,[string]$Python)
$record = @{kind=$Command;codex_home=$CodexHome;home_directory=$HomeDirectory}
$record | ConvertTo-Json -Compress | Add-Content -LiteralPath (Join-Path $PSScriptRoot 'calls.jsonl') -Encoding UTF8
exit 0
''', encoding="utf-8")
            home = root / "user's home"
            arguments = ["powershell.exe", "-NoProfile", "-NonInteractive", "-File", str(scripts/"update-dependencies.ps1"),
                         "-HostName", "homelab-desktop", "-HomeDirectory", str(home)]
            if install:
                arguments.append("-Install")
            explicit = root / "separate codex"
            if extra:
                arguments.extend(["-CodexHome", str(explicit)])
            completed = subprocess.run(arguments, capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(completed.returncode, 0, completed.stderr)
            calls = [json.loads(line.lstrip("\ufeff")) for line in (scripts/"calls.jsonl").read_text(encoding="utf-8-sig").splitlines()]
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
