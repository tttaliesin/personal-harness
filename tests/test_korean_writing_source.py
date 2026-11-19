"""Check the pinned Korean writing imports and the portable Codex runtime."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class KoreanWritingSourceTests(unittest.TestCase):
    def test_complete_imports_match_the_pinned_upstream_files(self):
        provenance = json.loads(
            (ROOT / "sources/korean-development-writing.json").read_text(encoding="utf-8")
        )["skills"]
        self.assertEqual(set(provenance), {"ste-ko", "humanize-korean"})
        for name, source in provenance.items():
            with self.subTest(skill=name):
                self.assertRegex(source["source_commit"], r"^[0-9a-f]{40}$")
                skill = ROOT / "skills" / name
                actual = {
                    path.relative_to(skill).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
                    for path in skill.rglob("*") if path.is_file()
                }
                if name == "ste-ko":
                    self.assertIn("references/SPEC.md", actual)
                    actual.pop("SKILL.md")
                self.assertEqual(actual, {path: file["sha256"] for path, file in source["files"].items()})
                self.assertIn("LICENSE", actual)

    def test_editor_runs_in_an_independent_workspace_and_flags_weakened_obligation(self):
        scripts = ROOT / "skills/humanize-korean/scripts"
        text = "릴리스 담당자는 테스트를 통과한 경우에만 배포 기록을 남겨야 한다. 긴급 수정에는 별도 절차를 적용한다."
        with tempfile.TemporaryDirectory(prefix="korean-writing-") as temporary:
            workspace = Path(temporary)
            run = workspace / "검토 문서"
            run.mkdir()
            before = run / "01_input.txt"
            after = run / "final.md"
            before.write_text(text, encoding="utf-8")
            prepare = subprocess.run(
                [sys.executable, "-B", str(scripts / "prepare_monolith_input.py"),
                 "--run-dir", str(run), "--genre", "report"],
                cwd=workspace, capture_output=True, timeout=20,
            )
            self.assertEqual(prepare.returncode, 0, prepare.stdout + prepare.stderr)
            metrics = json.loads((run / "00_metrics.json").read_text(encoding="utf-8"))
            self.assertIn(metrics["route_hint"], {"light", "standard", "heavy"})
            self.assertEqual(before.read_text(encoding="utf-8"), text)

            for candidate, expected in ((text, 0), (text.replace("남겨야 한다", "남긴다"), 1)):
                with self.subTest(expected_gate_exit=expected):
                    after.write_text(candidate, encoding="utf-8")
                    gate = subprocess.run(
                        [sys.executable, "-B", str(scripts / "verify_gates.py"),
                         "--before", str(before), "--after", str(after), "--genre", "report", "--json"],
                        cwd=workspace, capture_output=True, timeout=20,
                    )
                    self.assertEqual(gate.returncode, expected, gate.stdout + gate.stderr)
                    report = json.loads(gate.stdout[gate.stdout.index(b"{"):])
                    self.assertEqual(len(report["modality"]["lost_pairs"]), expected)

    @unittest.skipUnless(sys.platform == "win32", "Windows PowerShell workflow")
    def test_preparation_and_verification_reuse_run_directory_across_process_temp_changes(self):
        powershell = shutil.which("powershell.exe")
        self.assertIsNotNone(powershell)
        skill = ROOT / "skills/humanize-korean"
        prepare = ROOT / "skills/humanize-windows-runtime/scripts/prepare.ps1"
        text = "릴리스 담당자는 테스트가 통과한 경우에만 배포 기록을 남겨야 한다."
        command = (
            "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)\n"
            "& $env:POLISH_TEST_SCRIPT -SkillRoot $env:POLISH_TEST_SKILL "
            "-ScratchRoot $env:POLISH_TEST_SCRATCH -InputText $env:POLISH_TEST_SOURCE "
            "-Genre report -Python $env:POLISH_TEST_PYTHON"
        )
        with tempfile.TemporaryDirectory(prefix="writing-runtime-") as temp:
            workspace = Path(temp)
            first = workspace / "#!sandbox.{a}" / "Temp"
            second = workspace / "#!sandbox.{b}" / "Temp"
            first.mkdir(parents=True)
            second.mkdir(parents=True)
            shared = workspace / "shared run files"
            environment = {
                **os.environ, "POLISH_TEST_SCRIPT": str(prepare), "POLISH_TEST_SKILL": str(skill),
                "POLISH_TEST_SOURCE": text, "POLISH_TEST_PYTHON": sys.executable,
                "TEMP": str(first), "TMP": str(first),
            }

            def prepare_in(root):
                return subprocess.run(
                    [powershell, "-NoProfile", "-NonInteractive", "-Command", command],
                    env={**environment, "POLISH_TEST_SCRATCH": str(root)},
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=25,
                )

            rejected = prepare_in(first / "invalid")
            self.assertNotEqual(rejected.returncode, 0)
            self.assertFalse((first / "invalid").exists())

            prepared = prepare_in(shared)
            self.assertEqual(prepared.returncode, 0, prepared.stdout + prepared.stderr)
            result = json.loads(prepared.stdout.decode("utf-8-sig"))
            run = Path(result["runDir"])
            self.assertEqual(run.parent.resolve(), shared.resolve())
            self.assertIn(result["route"], {"light", "standard", "heavy"})
            before = run / "01_input.txt"
            self.assertIn(text, (run / "01_input_with_metrics.txt").read_text(encoding="utf-8"))
            self.assertEqual(before.read_text(encoding="utf-8"), text)
            after = run / "final.md"
            after.write_text(text, encoding="utf-8")
            gate = subprocess.run(
                [result["python"], "-B", "-X", "utf8", str(skill / "scripts/verify_gates.py"),
                 "--before", str(before), "--after", str(after), "--genre", "report", "--json"],
                cwd=second, env={**os.environ, "TEMP": str(second), "TMP": str(second)},
                capture_output=True, timeout=25,
            )
            self.assertEqual(gate.returncode, 0, gate.stdout + gate.stderr)
