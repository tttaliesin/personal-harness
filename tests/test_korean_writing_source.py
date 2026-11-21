"""Check the Korean writing source declarations and the Windows adapter."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import tomlkit


ROOT = Path(__file__).resolve().parents[1]

EDITOR_PREPARE_FIXTURE = """\
import argparse
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--run-dir", type=Path, required=True)
parser.add_argument("--genre", choices=["report"], required=True)
run = parser.parse_args().run_dir
original = (run / "01_input.txt").read_bytes()
(run / "00_metrics.json").write_text('{"route_hint": "heavy"}', encoding="utf-8")
(run / "01_input_with_metrics.txt").write_bytes(b"Fixture metrics\\n" + original)
"""

EDITOR_VERIFY_FIXTURE = """\
import argparse
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--before", type=Path, required=True)
parser.add_argument("--after", type=Path, required=True)
parser.add_argument("--genre", choices=["report"], required=True)
parser.add_argument("--json", action="store_true", required=True)
args = parser.parse_args()
if args.before.read_bytes() != args.after.read_bytes():
    raise SystemExit("The fixture expected identical input and output bytes")
"""


class KoreanWritingSourceTests(unittest.TestCase):
    def setUp(self):
        registry = tomlkit.parse((ROOT / "registry.toml").read_text(encoding="utf-8"))
        self.skills = {entry["name"]: entry for entry in registry["skills"]}

    def test_humanize_manifest_maps_the_codex_skill_and_portable_scripts(self):
        scripts = ("checks", "console", "lexical_layer", "prepare_monolith_input", "reassemble_chunks",
                   "restore_modality", "sanitize_text", "strip_injected_commas", "verify_change_rate", "verify_gates")
        self.assertEqual(self.skills["humanize-korean"], {
            "name": "humanize-korean",
            "role": "upstream",
            "source": "https://github.com/epoko77-ai/im-not-ai.git",
            "channel": "latest-release",
            "files": {
                "LICENSE": "LICENSE",
                "SKILL.md": "codex/skills/humanize-korean/SKILL.md",
                "agents": "codex/skills/humanize-korean/agents",
                "references": "skills/humanize-korean/references",
                **{f"scripts/{name}.py": f"scripts/{name}.py" for name in scripts},
            },
        })

    def test_ste_ko_manifest_maps_references_and_license_onto_the_local_adapter(self):
        self.assertEqual(self.skills["ste-ko"], {
            "name": "ste-ko",
            "role": "adapter",
            "path": "skills/adapters/ste-ko",
            "adapts": "beamonic/ste-ko",
            "source": "https://github.com/beamonic/ste-ko.git",
            "channel": "default-branch",
            "files": {
                "LICENSE": "LICENSE",
                "references/README.md": "README.md",
                "references/SPEC.md": "SPEC.md",
                "references/benchmarks": "benchmarks",
                "references/dictionary.md": "dictionary.md",
                "references/tasks.md": "tasks.md",
            },
        })

    @unittest.skipUnless(sys.platform == "win32", "Windows PowerShell workflow")
    def test_preparation_and_verification_reuse_run_directory_across_process_temp_changes(self):
        powershell = shutil.which("powershell.exe")
        self.assertIsNotNone(powershell)
        prepare = ROOT / "skills/adapters/humanize-windows-runtime/scripts/prepare.ps1"
        text = "릴리스 담당자는 테스트가 통과한 경우에만 배포 기록을 남겨야 한다."
        command = (
            "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)\n"
            "& $env:POLISH_TEST_SCRIPT -SkillRoot $env:POLISH_TEST_SKILL "
            "-ScratchRoot $env:POLISH_TEST_SCRATCH -InputText $env:POLISH_TEST_SOURCE "
            "-Genre report -Python $env:POLISH_TEST_PYTHON"
        )
        scratch = ROOT / ".local"
        scratch.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="writing-runtime-", dir=scratch) as temp:
            workspace = Path(temp)
            editor = workspace / "editor fixture"
            scripts = editor / "scripts"
            scripts.mkdir(parents=True)
            (scripts / "prepare_monolith_input.py").write_text(EDITOR_PREPARE_FIXTURE, encoding="utf-8")
            verify = scripts / "verify_gates.py"
            verify.write_text(EDITOR_VERIFY_FIXTURE, encoding="utf-8")
            first = workspace / "#!sandbox.{a}" / "Temp"
            second = workspace / "#!sandbox.{b}" / "Temp"
            first.mkdir(parents=True)
            second.mkdir(parents=True)
            shared = workspace / "shared run files"
            environment = {
                **os.environ, "POLISH_TEST_SCRIPT": str(prepare), "POLISH_TEST_SKILL": str(editor),
                "POLISH_TEST_SOURCE": text, "POLISH_TEST_PYTHON": sys.executable,
                "TEMP": str(first), "TMP": str(first),
            }

            def prepare_in(root):
                return subprocess.run(
                    [powershell, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
                    env={**environment, "POLISH_TEST_SCRATCH": str(root)},
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=25,
                )

            rejected = prepare_in(first / "invalid")
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn(b"Choose a shared scratch path", rejected.stderr)
            self.assertFalse((first / "invalid").exists())

            prepared = prepare_in(shared)
            self.assertEqual(prepared.returncode, 0, prepared.stdout + prepared.stderr)
            result = json.loads(prepared.stdout.decode("utf-8-sig"))
            run = Path(result["runDir"])
            self.assertEqual(run.parent.resolve(), shared.resolve())
            self.assertEqual(result["route"], "heavy")
            before = run / "01_input.txt"
            self.assertEqual(before.read_bytes(), text.encode("utf-8"))
            self.assertEqual((run / "01_input_with_metrics.txt").read_bytes(), b"Fixture metrics\n" + before.read_bytes())
            after = run / "final.md"
            after.write_text(text, encoding="utf-8")
            gate = subprocess.run(
                [result["python"], "-B", "-X", "utf8", str(verify),
                 "--before", str(before), "--after", str(after), "--genre", "report", "--json"],
                cwd=second, env={**os.environ, "TEMP": str(second), "TMP": str(second)},
                capture_output=True, timeout=25,
            )
            self.assertEqual(gate.returncode, 0, gate.stdout + gate.stderr)
