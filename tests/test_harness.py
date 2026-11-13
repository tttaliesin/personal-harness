"""Contract tests for config preservation and safe harness deployment.

Run with: .venv/Scripts/python.exe -B -m unittest discover -s tests -v
All deployment fixtures, including the simulated "outside" directories, live
under TemporaryDirectory. No test runs a prerequisite command or installs it.
"""

from __future__ import annotations

import copy
from contextlib import ExitStack
import io
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import tomllib
import unittest
from unittest import mock


_MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "harness.py"
_SPEC = importlib.util.spec_from_file_location("_harness_contract_target", _MODULE_PATH)
assert _SPEC is not None and _SPEC.loader is not None
harness = importlib.util.module_from_spec(_SPEC)
sys.modules[_SPEC.name] = harness
_SPEC.loader.exec_module(harness)

# Capture this before mocking subprocess execution. This is used only
# to create a local test junction when Windows does not permit symlink creation.
_LOCAL_SUBPROCESS_RUN = subprocess.run


CURRENT_CONFIG = r'''# workstation header: keep this explanation
model = "workstation-model" # keep model comment
model_reasoning_effort = "high"
model_provider = "opencodex"
notify = ['C:\Local Tools\notify.exe', '--toast'] # keep notify comment
model_catalog_json = 'C:\Local Catalog\models.json'
openai_base_url = "https://opencodex.invalid/v1"
experimental_realtime_ws_base_url = "wss://opencodex.invalid/realtime"

[desktop]
autoArchiveAfterDays = 14 # keep desktop comment
futureDesktopOption = "local-only"

[features]
local_feature = true

# node runtime block stays local
[mcp_servers.node_repl]
command = 'C:\Local Runtime\node.exe'
args = ['C:\Local Runtime\server.mjs', '--stdio']
startup_timeout_sec = 45

[mcp_servers.node_repl.env]
NODE_PATH = 'C:\Local Runtime\node_modules' # keep env comment
RUNTIME_TOKEN = "dummy-test-token"
UNICODE_VALUE = "로컬 환경"

[mcp_servers.codegraph]
command = "old-codegraph"
args = ["old-serve"]
custom_transport = "local-transport"

[mcp_servers.unrelated]
command = "keep-this-server"

[model_providers.opencodex]
name = "Local OpenCodex"
base_url = "https://provider.opencodex.invalid/v1"
wire_api = "responses"
requires_openai_auth = false

[projects.'F:\Personal Projects\trusted']
trust_level = "trusted" # keep project trust comment

[hooks]
session_start = [{ command = 'C:\Local Hooks\start.ps1', timeout = 9 }]

[computer_use]
command = "local-computer-runtime"

[marketplaces.private]
source = "https://marketplace.invalid/private"

[plugins."unrelated@private"]
enabled = true
local_metadata = "keep plugin metadata"

[unknown_config.deep]
enabled = false
numbers = [1, 3, 5]

[[unknown_config.workflows]]
name = "미래 설정"
options = { preserve = true, values = ["a", "b"] }
'''

COMMON_CONFIG = '''# shared preferences
model = "shared-model"
model_reasoning_effort = "max"

[desktop]
autoArchiveAfterDays = 1

[features]
multi_agent = true

[mcp_servers.codegraph]
command = "codegraph"
args = ["serve", "--mcp"]

[[skills.config]]
name = "agent-desktop"
enabled = true
'''

PRESERVED_KEYS = (
    "notify", "model_catalog_json", "openai_base_url",
    "experimental_realtime_ws_base_url", "model_provider", "model_providers",
    "projects", "hooks", "computer_use", "marketplaces", "unknown_config",
)
COMMENT_MARKERS = (
    "# workstation header: keep this explanation",
    "# keep model comment", "# keep notify comment", "# keep desktop comment",
    "# node runtime block stays local", "# keep env comment",
    "# keep project trust comment",
)


def write_file(path: Path, data: str | bytes) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data.encode("utf-8") if isinstance(data, str) else data)
    return path


def tree_snapshot(root: Path) -> dict:
    """Record files and links without traversing a symlink or junction."""
    result = {}

    def visit(path):
        relative = path.relative_to(root).as_posix()
        is_junction = getattr(path, "is_junction", lambda: False)()
        if path.is_symlink() or is_junction:
            result[relative] = ("link", str(path.readlink()))
        elif path.is_dir():
            result[relative] = ("directory",)
            for child in sorted(path.iterdir()):
                visit(child)
        else:
            stat = path.stat()
            result[relative] = ("file", path.read_bytes(), stat.st_mtime_ns)

    if root.exists():
        visit(root)
    return result


class FakeRepository:
    """Small repo and user home, independent of the real repo's data files."""

    def __init__(self, root: Path, *, ready=True, custom_codex=False):
        self.root = root
        self.repo = root / "repo with spaces 한글"
        self.home = root / "user's home"
        self.codex = root / "custom codex" if custom_codex else self.home / ".codex"
        self.commands = {
            "fake-codegraph": self.repo / "fake-bin" / "codegraph.cmd",
            "fake-agent-desktop": self.repo / "fake-bin" / "agent-desktop.cmd",
        }
        self.skill_files = {
            ("create-readme", "SKILL.md"): b"# README skill\n",
            ("create-readme", "references/guide.md"): "# 사용 지침\n".encode(),
            ("agent-desktop", "SKILL.md"): b"# Desktop skill\r\n",
            ("agent-desktop", "scripts/payload.bin"): b"\x00\xff\x01\r\n",
            ("agent-desktop-windows", "SKILL.md"): b"# Windows desktop skill\n",
            ("agent-desktop-windows", ".metadata"): b"hidden source file\n",
        }
        write_file(self.repo / "common" / "config.toml", COMMON_CONFIG)
        write_file(
            self.repo / "common" / "AGENTS.md",
            "# 공통 지침\nSkills live in ${CODEX_HOME}/skills.\n",
        )
        self.write_host("roylabs-desktop")
        self.write_host("homelab-desktop")
        for (skill, relative), payload in self.skill_files.items():
            write_file(self.repo / "skills" / skill / relative, payload)
        if ready:
            write_file(self.codex / "plugins/cache/pstack-claude/pstack/1.0/.codex-plugin/plugin.json", "{}")
            write_file(self.codex / "plugins/cache/egm/egm/2.0/plugin.json", "{}")
            for command in self.commands.values():
                write_file(command, "This fixture must never be executed.\n")
            write_file(
                self.codex / "config.toml",
                b"\xef\xbb\xbf" + CURRENT_CONFIG.replace("\n", "\r\n").encode(),
            )
            write_file(self.codex / "AGENTS.md", b"\xef\xbb\xbf# Old local instructions\r\n")
            write_file(self.codex / "skills/agent-desktop/SKILL.md", b"old desktop\r\n\x00")
            write_file(self.codex / "skills/unrelated/SKILL.md", b"do not touch\r\n")
            write_file(self.home / "unrelated.txt", b"unmanaged home file\x00\xff")

    def write_host(self, host="roylabs-desktop", *, config="", paths=None):
        configured = {
            "codegraph": "fake-codegraph",
            "agent_desktop": "fake-agent-desktop",
        }
        configured.update(paths or {})
        text = f'name = {json.dumps(host)}\nplatform = "windows"\n\n[paths]\n'
        text += "".join(f"{key} = {json.dumps(value, ensure_ascii=False)}\n" for key, value in configured.items())
        text += '\n[config.windows]\nsandbox = "elevated"\n'
        text += config
        write_file(self.repo / "hosts" / f"{host}.toml", text)

    def which(self, name):
        command = self.commands.get(name)
        return str(command) if command is not None and command.is_file() else None

    def expected_targets(self):
        result = {self.codex / "config.toml", self.codex / "AGENTS.md"}
        for skill, relative in self.skill_files:
            root = self.home / ".agents" if skill == "create-readme" else self.codex
            result.add(root / "skills" / skill / relative)
        return result


class ConfigPreservationTests(unittest.TestCase):
    def assert_preserved(self, rendered):
        before, after = tomllib.loads(CURRENT_CONFIG), tomllib.loads(rendered)
        for key in PRESERVED_KEYS:
            with self.subTest(preserved=key):
                self.assertEqual(after[key], before[key])
        self.assertEqual(after["mcp_servers"]["node_repl"], before["mcp_servers"]["node_repl"])
        self.assertEqual(after["mcp_servers"]["unrelated"], before["mcp_servers"]["unrelated"])
        self.assertEqual(after["plugins"]["unrelated@private"], before["plugins"]["unrelated@private"])
        self.assertEqual(after["desktop"]["futureDesktopOption"], "local-only")
        self.assertTrue(after["features"]["local_feature"])
        self.assertEqual(after["mcp_servers"]["codegraph"]["custom_transport"], "local-transport")
        for marker in COMMENT_MARKERS:
            with self.subTest(comment=marker):
                self.assertEqual(rendered.count(marker), 1)

    def test_common_merge_preserves_comments_runtime_and_unknown_configuration(self):
        rendered = harness.merge_documents(CURRENT_CONFIG, COMMON_CONFIG)
        self.assert_preserved(rendered)
        merged = tomllib.loads(rendered)
        self.assertEqual(merged["model"], "shared-model")
        self.assertEqual(merged["model_reasoning_effort"], "max")
        self.assertEqual(merged["desktop"]["autoArchiveAfterDays"], 1)
        self.assertTrue(merged["features"]["multi_agent"])
        self.assertEqual(merged["mcp_servers"]["codegraph"]["args"], ["serve", "--mcp"])

    def test_empty_overlays_preserve_the_entire_document(self):
        self.assertEqual(harness.merge_documents(CURRENT_CONFIG, "", " \n", ""), CURRENT_CONFIG)

    def test_repeated_merge_is_byte_stable(self):
        once = harness.merge_documents(CURRENT_CONFIG, COMMON_CONFIG)
        twice = harness.merge_documents(once, COMMON_CONFIG)
        self.assertEqual(twice, once)
        self.assert_preserved(twice)

    def test_host_then_local_overrides_merge_leaves_and_may_set_local_runtime(self):
        host = '''model = "host-model"
notify = ["host-notifier"]
[desktop]
autoArchiveAfterDays = 4
host_only = true
[mcp_servers.node_repl.env]
HOST_SETTING = "from-host"
'''
        local = '''model = "local-model"
notify = ["local-notifier"]
openai_base_url = "https://local.opencodex.invalid/v1"
[desktop]
autoArchiveAfterDays = 7
local_only = true
[mcp_servers.node_repl.env]
HOST_SETTING = "local-wins"
'''
        merged = tomllib.loads(harness.merge_documents(CURRENT_CONFIG, COMMON_CONFIG, host, local))
        self.assertEqual(merged["model"], "local-model")
        self.assertEqual(merged["notify"], ["local-notifier"])
        self.assertEqual(merged["openai_base_url"], "https://local.opencodex.invalid/v1")
        self.assertEqual(merged["desktop"], {
            "autoArchiveAfterDays": 7, "futureDesktopOption": "local-only",
            "host_only": True, "local_only": True,
        })
        expected_env = copy.deepcopy(tomllib.loads(CURRENT_CONFIG)["mcp_servers"]["node_repl"]["env"])
        expected_env["HOST_SETTING"] = "local-wins"
        self.assertEqual(merged["mcp_servers"]["node_repl"]["env"], expected_env)

    def test_table_overlay_on_scalar_reports_conflict_instead_of_discarding_it(self):
        with self.assertRaises(harness.HarnessError):
            harness.merge_documents('features = "local-value"\n', "[features]\nmulti_agent = true\n")


class SkillSelectionTests(unittest.TestCase):
    CURRENT = '''[skills]
future_option = "preserve"
[[skills.config]]
name = "selected"
enabled = false # keep skill comment
local_field = "keep"
[skills.config.options]
local_option = true
[[skills.config]]
path = "C:/local/skill"
enabled = false
local_field = "path metadata"
[[skills.config]]
name = "scoped"
path = "C:/first/skill"
enabled = false
[[skills.config]]
name = "scoped"
path = "C:/second/skill"
enabled = false
[[skills.config]]
name = "unrelated"
enabled = false
metadata = { tags = ["keep", "미래"] }
'''
    OVERLAY = '''[[skills.config]]
name = "selected"
enabled = true
[skills.config.options]
new_option = 3
[[skills.config]]
path = "C:/local/skill"
enabled = true
[[skills.config]]
name = "scoped"
path = "C:/second/skill"
enabled = true
[[skills.config]]
name = "new-selection"
enabled = true
'''

    def test_merge_matches_name_path_and_pair_and_keeps_unrelated_entries(self):
        rendered = harness.merge_documents(self.CURRENT, "", self.OVERLAY)
        expected = copy.deepcopy(tomllib.loads(self.CURRENT))
        entries = expected["skills"]["config"]
        entries[0]["enabled"] = True
        entries[0]["options"]["new_option"] = 3
        entries[1]["enabled"] = True
        entries[3]["enabled"] = True
        entries.append({"name": "new-selection", "enabled": True})
        self.assertEqual(tomllib.loads(rendered), expected)
        self.assertIn("# keep skill comment", rendered)

    def test_repeated_skill_overlays_are_idempotent_across_all_layers(self):
        common = '[[skills.config]]\nname = "selected"\nenabled = false\n'
        local = '[[skills.config]]\nname = "selected"\nenabled = false\n'
        once = harness.merge_documents(self.CURRENT, common, self.OVERLAY, local)
        twice = harness.merge_documents(once, common, self.OVERLAY, local)
        self.assertEqual(twice, once)
        entries = tomllib.loads(twice)["skills"]["config"]
        self.assertEqual(len(entries), 6)
        self.assertFalse(entries[0]["enabled"])
        self.assertEqual(entries[4], tomllib.loads(self.CURRENT)["skills"]["config"][4])

    def test_common_aot_merges_into_inline_arrays_and_all_layers_remain_stable(self):
        cases = (
            ("empty", "[]", [{"name": "computer-use", "enabled": False}]),
            (
                "populated",
                '[{name = "computer-use", enabled = true, local_field = "keep"}, '
                '{name = "unrelated", enabled = false, metadata = {tags = ["keep", "미래"]}}]',
                [
                    {"name": "computer-use", "enabled": False, "local_field": "keep"},
                    {"name": "unrelated", "enabled": False, "metadata": {"tags": ["keep", "미래"]}},
                ],
            ),
        )
        common = '''model = "common-model"
[[skills.config]]
name = "computer-use"
enabled = false
[[skills.config]]
name = "agent-desktop"
enabled = true
'''
        host = '''model = "host-model"
[[skills.config]]
name = "host-added"
enabled = true
'''
        local = '''model = "local-model"
[[skills.config]]
name = "agent-desktop"
enabled = false
[[skills.config]]
name = "local-added"
enabled = true
'''
        for label, inline, expected_entries in cases:
            with self.subTest(storage=label):
                current = (
                    'model = "current-model"\n[skills]\nfuture_option = "keep"\n'
                    f'config = {inline} # keep inline selection comment\n'
                    '[unrelated]\nitems = ["local", "설정"]\n'
                )
                expected = {
                    "model": "local-model",
                    "skills": {
                        "future_option": "keep",
                        "config": expected_entries + [
                            {"name": "agent-desktop", "enabled": False},
                            {"name": "host-added", "enabled": True},
                            {"name": "local-added", "enabled": True},
                        ],
                    },
                    "unrelated": {"items": ["local", "설정"]},
                }
                once = harness.merge_documents(current, common, host, local)
                self.assertEqual(tomllib.loads(once), expected)
                self.assertIn("# keep inline selection comment", once)
                self.assertEqual(harness.merge_documents(once, common, host, local), once)

    def test_common_aot_creates_missing_skill_array_without_invalid_toml(self):
        common = '''[[skills.config]]
name = "computer-use"
enabled = false
[[skills.config]]
name = "agent-desktop"
enabled = true
'''
        for current in ('model = "local-model"\n', 'model = "local-model"\n[skills]\nfuture_option = "keep"\n'):
            with self.subTest(current=current):
                expected = tomllib.loads(current)
                expected.setdefault("skills", {})["config"] = [
                    {"name": "computer-use", "enabled": False},
                    {"name": "agent-desktop", "enabled": True},
                ]
                once = harness.merge_documents(current, common)
                self.assertEqual(tomllib.loads(once), expected)
                self.assertEqual(harness.merge_documents(once, common), once)

    def test_name_only_selection_updates_existing_entry_without_losing_local_path(self):
        current = '''[skills]
future_option = "keep"
[[skills.config]]
name = "computer-use"
path = "C:/local/computer-use"
enabled = true # keep local skill comment
local_metadata = { keep = true }
[[skills.config]]
name = "unrelated"
enabled = true
'''
        common = '[[skills.config]]\nname = "computer-use"\nenabled = false\n'
        expected = tomllib.loads(current)
        expected["skills"]["config"][0]["enabled"] = False
        once = harness.merge_documents(current, common)
        self.assertEqual(tomllib.loads(once), expected)
        self.assertIn("# keep local skill comment", once)
        self.assertEqual(harness.merge_documents(once, common), once)

    def test_path_only_selection_updates_named_entry_among_same_name_candidates(self):
        host = '[[skills.config]]\npath = "C:/second/skill"\nenabled = true\n'
        expected = tomllib.loads(self.CURRENT)
        expected["skills"]["config"][3]["enabled"] = True
        once = harness.merge_documents(self.CURRENT, "", host)
        self.assertEqual(tomllib.loads(once), expected)
        self.assertEqual(harness.merge_documents(once, "", host), once)

    def test_name_and_path_pair_does_not_match_partial_candidates(self):
        host = '[[skills.config]]\nname = "scoped"\npath = "C:/local/skill"\nenabled = true\n'
        expected = tomllib.loads(self.CURRENT)
        expected["skills"]["config"].append({"name": "scoped", "path": "C:/local/skill", "enabled": True})
        once = harness.merge_documents(self.CURRENT, "", host)
        self.assertEqual(tomllib.loads(once), expected)
        self.assertEqual(harness.merge_documents(once, "", host), once)

    def test_name_only_selection_rejects_multiple_existing_paths_in_every_layer(self):
        inline = '''[skills]
config = [{name = "scoped", path = "C:/first/skill", enabled = false}, {name = "scoped", path = "C:/second/skill", enabled = true}]
'''
        overlay = '[[skills.config]]\nname = "scoped"\nenabled = false\n'
        for storage, current in (("aot", self.CURRENT), ("inline", inline)):
            for layer in range(3):
                with self.subTest(storage=storage, layer=layer):
                    overlays = ["", "", ""]
                    overlays[layer] = overlay
                    with self.assertRaises(harness.HarnessError):
                        harness.merge_documents(current, *overlays)

    def test_path_only_selection_rejects_multiple_existing_names(self):
        aot = '''[[skills.config]]
name = "first"
path = "relative/shared-skill"
enabled = true
[[skills.config]]
name = "second"
path = "relative/shared-skill"
enabled = false
'''
        inline = '''[skills]
config = [{name = "first", path = "relative/shared-skill", enabled = true}, {name = "second", path = "relative/shared-skill", enabled = false}]
'''
        common = '[[skills.config]]\npath = "relative/shared-skill"\nenabled = false\n'
        for storage, current in (("aot", aot), ("inline", inline)):
            with self.subTest(storage=storage):
                with self.assertRaises(harness.HarnessError):
                    harness.merge_documents(current, common)

    def test_unidentified_selection_is_rejected_in_every_overlay_layer(self):
        invalid = "[[skills.config]]\nenabled = true\n"
        for layer in range(3):
            with self.subTest(layer=layer):
                overlays = ["", "", ""]
                overlays[layer] = invalid
                with self.assertRaises(harness.HarnessError):
                    harness.merge_documents(self.CURRENT, *overlays)

    def test_ambiguous_existing_selection_is_rejected(self):
        for identity in (
            'name = "duplicate"', 'path = "relative/duplicate"',
            'name = "duplicate"\npath = "relative/duplicate"',
        ):
            with self.subTest(identity=identity):
                current = f"[[skills.config]]\n{identity}\nenabled = true\n" * 2
                overlay = f"[[skills.config]]\n{identity}\nenabled = false\n"
                with self.assertRaises(harness.HarnessError):
                    harness.merge_documents(current, overlay)


class CommonValidationTests(unittest.TestCase):
    def test_machine_runtime_settings_are_rejected_from_common(self):
        fragments = {
            "notify": 'notify = ["local-notifier"]',
            "catalog": 'model_catalog_json = "models.json"',
            "endpoint": 'openai_base_url = "https://provider.invalid/v1"',
            "realtime": 'experimental_realtime_ws_base_url = "wss://provider.invalid"',
            "projects": '[projects.example]\ntrust_level = "trusted"',
            "hooks": '[hooks]\nstartup = []',
            "providers": '[model_providers.private]\nname = "private"',
            "computer_use": '[computer_use]\ncommand = "local-runtime"',
            "marketplaces": '[marketplaces.private]\nsource = "local"',
            "node_repl": '[mcp_servers.node_repl.env]\nTOKEN = "dummy"',
        }
        for name, fragment in fragments.items():
            with self.subTest(setting=name):
                with self.assertRaises(harness.HarnessError):
                    harness.merge_documents(CURRENT_CONFIG, fragment)

    def test_windows_drive_paths_are_rejected_even_inside_nested_arrays(self):
        for absolute in (r"C:\Local Tools\tool.exe", "D:/Local Tools/tool.exe"):
            with self.subTest(path=absolute):
                common = '[portable]\nitems = [{ args = ["--tool", ' + json.dumps(absolute) + "] }]\n"
                with self.assertRaises(harness.HarnessError):
                    harness.merge_documents(CURRENT_CONFIG, common)

    def test_posix_and_unc_absolute_paths_are_rejected_from_common(self):
        for absolute in ("/opt/private/tool", r"\\server\share\tool.exe", "//server/share/tool.exe"):
            with self.subTest(path=absolute):
                common = "[portable]\nargs = [" + json.dumps(absolute) + "]\n"
                with self.assertRaises(harness.HarnessError):
                    harness.merge_documents(CURRENT_CONFIG, common)

    def test_relative_paths_and_https_urls_remain_portable(self):
        common = '''[portable]
paths = ["skills/reference", "./bin/tool", "../sibling/skill"]
documentation = "https://example.invalid/guide"
'''
        merged = tomllib.loads(harness.merge_documents("", common))
        self.assertEqual(merged, tomllib.loads(common))


class TemporaryHarnessTestCase(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory(prefix="harness-contract-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.fixture = FakeRepository(self.root / "fixture")
        self.which = self.enterContext(mock.patch.object(harness.shutil, "which", side_effect=self.fake_which))
        self.process = self.enterContext(mock.patch.object(
            subprocess, "run", side_effect=AssertionError("A test attempted to execute an external command"),
        ))

    def fake_which(self, name):
        return self.fixture.which(name)

    def build(self, **kwargs):
        return harness.build_plan(
            self.fixture.repo, kwargs.pop("host", "roylabs-desktop"),
            self.fixture.home, kwargs.pop("codex_home", self.fixture.codex), **kwargs,
        )

    def make_directory_link(self, destination, source):
        """Create a real link entirely inside the test's TemporaryDirectory."""
        destination, source = Path(destination), Path(source)
        self.assertTrue(destination.is_relative_to(self.root))
        self.assertTrue(source.is_relative_to(self.root))
        destination.parent.mkdir(parents=True, exist_ok=True)
        try:
            destination.symlink_to(source, target_is_directory=True)
        except OSError as exc:
            if os.name != "nt" or getattr(exc, "winerror", None) != 1314:
                raise
            # Junctions need no symlink privilege. No shell string contains a
            # path outside this test's checked temporary root.
            quoted = ["'" + str(path).replace("'", "''") + "'" for path in (destination, source)]
            command = (
                "$ErrorActionPreference='Stop'; New-Item -ItemType Junction "
                f"-Path {quoted[0]} -Target {quoted[1]} | Out-Null"
            )
            _LOCAL_SUBPROCESS_RUN(
                ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
                check=True, capture_output=True, timeout=20,
            )
        self.addCleanup(self.remove_directory_link, destination)

    @staticmethod
    def remove_directory_link(path):
        if path.is_symlink():
            path.unlink()
        elif getattr(path, "is_junction", lambda: False)():
            path.rmdir()

    def simple_plan(self, changes=()):
        return harness.Plan(
            "roylabs-desktop", self.fixture.home, self.fixture.codex,
            changes=list(changes),
        )

    def change(self, path, after, *, root=None):
        before = path.read_bytes() if path.exists() else None
        return harness.FileChange(path, before, after, root or self.fixture.codex)


class BuildPlanTests(TemporaryHarnessTestCase):
    def test_plan_is_read_only_and_lists_all_managed_files(self):
        before = tree_snapshot(self.root)
        plan = self.build()
        self.assertIsInstance(plan, harness.Plan)
        self.assertEqual(tree_snapshot(self.root), before)
        self.assertEqual(plan.missing, [])
        self.assertEqual({change.path for change in plan.changes}, self.fixture.expected_targets())
        self.assertEqual(len(plan.changes), len(self.fixture.expected_targets()))
        for change in plan.changes:
            with self.subTest(path=change.path):
                expected_before = change.path.read_bytes() if change.path.exists() else None
                self.assertEqual(change.before, expected_before)
                self.assertTrue(change.path.is_relative_to(change.root))
        self.process.assert_not_called()

    def test_missing_prerequisites_still_produce_a_read_only_file_list(self):
        self.fixture = FakeRepository(self.root / "not-installed", ready=False)
        before = tree_snapshot(self.root)
        plan = self.build()
        self.assertEqual(tree_snapshot(self.root), before)
        self.assertFalse(self.fixture.home.exists())
        self.assertEqual({change.path for change in plan.changes}, self.fixture.expected_targets())
        self.assertTrue(all(change.before is None for change in plan.changes))
        for expected in ("node_repl", "codegraph", "agent-desktop", "pstack@pstack-claude", "egm@egm"):
            with self.subTest(prerequisite=expected):
                self.assertTrue(any(expected in message for message in plan.missing), plan.missing)
        self.process.assert_not_called()

    def test_planned_config_preserves_existing_runtime_comments_and_unknown_values(self):
        plan = self.build()
        config = next(change for change in plan.changes if change.path == self.fixture.codex / "config.toml")
        rendered = config.after.decode()
        ConfigPreservationTests.assert_preserved(self, rendered)
        self.assertEqual(tomllib.loads(rendered)["windows"]["sandbox"], "elevated")
        self.assertEqual(tomllib.loads(rendered)["mcp_servers"]["codegraph"]["command"], str(self.fixture.commands["fake-codegraph"]))

    def test_inline_skill_arrays_in_planned_config_are_valid_and_second_plan_is_stable(self):
        for storage, inline in (
            ("empty", "[]"),
            ("populated", '[{name = "computer-use", path = "C:/local/computer-use", enabled = true, local_field = "keep"}, {name = "unrelated", enabled = false}]'),
        ):
            with self.subTest(storage=storage):
                self.fixture = FakeRepository(self.root / storage)
                config_path = self.fixture.codex / "config.toml"
                write_file(config_path, CURRENT_CONFIG + f"\n[skills]\nconfig = {inline}\n")
                write_file(
                    self.fixture.repo / "common/config.toml",
                    COMMON_CONFIG + '\n[[skills.config]]\nname = "computer-use"\nenabled = false\n',
                )
                before = tree_snapshot(self.root)
                plan = self.build()
                self.assertEqual(plan.missing, [])
                self.assertEqual(tree_snapshot(self.root), before)
                merged = next(change.after for change in plan.changes if change.path == config_path)
                expected_entries = [
                    {"name": "agent-desktop", "enabled": True},
                    {"name": "computer-use", "enabled": False},
                ] if storage == "empty" else [
                    {"name": "computer-use", "path": "C:/local/computer-use", "enabled": False, "local_field": "keep"},
                    {"name": "unrelated", "enabled": False},
                    {"name": "agent-desktop", "enabled": True},
                ]
                self.assertEqual(tomllib.loads(merged.decode())["skills"]["config"], expected_entries)
                ConfigPreservationTests.assert_preserved(self, merged.decode())
                write_file(config_path, merged)
                before_second = tree_snapshot(self.root)
                second = self.build()
                self.assertEqual(second.missing, [])
                self.assertNotIn(config_path, [change.path for change in second.changes])
                self.assertEqual(second.changes, [change for change in plan.changes if change.path != config_path])
                self.assertEqual(tree_snapshot(self.root), before_second)

    def test_both_supported_hosts_use_their_profile(self):
        for host in ("roylabs-desktop", "homelab-desktop"):
            with self.subTest(host=host):
                self.fixture.write_host(host, config=f'\n[config.host_marker]\nname = "{host}"\n')
                plan = self.build(host=host)
                config = next(change.after for change in plan.changes if change.path.name == "config.toml")
                self.assertEqual(plan.host, host)
                self.assertEqual(tomllib.loads(config.decode())["host_marker"]["name"], host)

    def test_default_codex_home_and_default_local_override_are_used(self):
        write_file(self.fixture.repo / ".local/roylabs-desktop.toml", '[config]\nmodel = "default-local"\n')
        plan = harness.build_plan(self.fixture.repo, "roylabs-desktop", self.fixture.home)
        self.assertEqual(plan.codex_home, self.fixture.home / ".codex")
        config = next(change.after for change in plan.changes if change.path.name == "config.toml")
        self.assertEqual(tomllib.loads(config.decode())["model"], "default-local")

    def test_custom_codex_explicit_local_overlays_and_nested_placeholders(self):
        self.fixture = FakeRepository(self.root / "overlays", custom_codex=True)
        self.fixture.write_host(config='''
[config]
model = "host-model"
[config.desktop]
autoArchiveAfterDays = 4
host_only = "${USERPROFILE}/host"
[config.placeholder_values]
paths = ["${USERPROFILE}/one", "${CODEX_HOME}/two", "${REPO_ROOT}/three"]
launch = [{ cwd = "${REPO_ROOT}", args = ["${CODEX_HOME}/script"] }]
''')
        write_file(self.fixture.repo / ".local/roylabs-desktop.toml", '[config]\nmodel = "wrong-default"\n')
        local = write_file(self.root / "chosen override.toml", '''[paths]
codegraph = "${REPO_ROOT}/fake-bin/codegraph.cmd"
agent_desktop = "${REPO_ROOT}/fake-bin/agent-desktop.cmd"
[config]
model = "local-model"
notify = ["${USERPROFILE}/notify.exe", "${CODEX_HOME}/catalog"]
[config.desktop]
autoArchiveAfterDays = 7
local_only = "${REPO_ROOT}/local"
[config.mcp_servers.node_repl.env]
LOCAL_HOME = "${USERPROFILE}"
''')
        before = tree_snapshot(self.root)
        plan = self.build(local_config=local)
        self.assertEqual(tree_snapshot(self.root), before)
        self.assertEqual(plan.missing, [])
        config = next(change.after.decode() for change in plan.changes if change.path.name == "config.toml")
        merged = tomllib.loads(config)
        home, codex, repo = (path.as_posix() for path in (self.fixture.home, self.fixture.codex, self.fixture.repo))
        self.assertEqual(merged["model"], "local-model")
        self.assertEqual(merged["notify"], [home + "/notify.exe", codex + "/catalog"])
        self.assertEqual(merged["desktop"]["autoArchiveAfterDays"], 7)
        self.assertEqual(merged["desktop"]["host_only"], home + "/host")
        self.assertEqual(merged["desktop"]["local_only"], repo + "/local")
        self.assertEqual(merged["placeholder_values"], {
            "paths": [home + "/one", codex + "/two", repo + "/three"],
            "launch": [{"cwd": repo, "args": [codex + "/script"]}],
        })
        self.assertEqual(merged["mcp_servers"]["node_repl"]["env"]["LOCAL_HOME"], home)
        self.assertEqual(merged["mcp_servers"]["node_repl"]["env"]["RUNTIME_TOKEN"], "dummy-test-token")
        self.assertEqual(merged["mcp_servers"]["codegraph"]["command"], str(self.fixture.commands["fake-codegraph"]))
        self.assertNotIn("${", config)
        instructions = next(change.after.decode() for change in plan.changes if change.path.name == "AGENTS.md")
        self.assertTrue(instructions.startswith(f"# 공통 지침\nSkills live in {codex}/skills.\n"))
        self.assertEqual(instructions.count("## Local tool executables"), 1)
        tool_instructions = instructions.split("## Local tool executables", 1)[1]
        for tool, executable in (
            ("agent-desktop", self.fixture.commands["fake-agent-desktop"]),
            ("codegraph", self.fixture.commands["fake-codegraph"]),
        ):
            self.assertIn(f"`{tool}`: `{executable.as_posix()}`", tool_instructions)
        self.assertNotIn("${", instructions)
        self.which.assert_not_called()  # configured prerequisite files suffice

    def test_unknown_host_or_local_placeholder_fails_without_writes(self):
        for layer in ("host", "local"):
            with self.subTest(layer=layer):
                self.fixture = FakeRepository(self.root / layer)
                invalid = '[config.nested]\nitems = [{ args = ["${UNKNOWN_PATH}/tool"] }]\n'
                if layer == "host":
                    self.fixture.write_host(config="\n" + invalid)
                else:
                    write_file(self.fixture.repo / ".local/roylabs-desktop.toml", invalid)
                before = tree_snapshot(self.root)
                with self.assertRaisesRegex(harness.HarnessError, "placeholder"):
                    self.build()
                self.assertEqual(tree_snapshot(self.root), before)

    def test_common_runtime_validation_is_also_enforced_by_build_plan(self):
        write_file(self.fixture.repo / "common/config.toml", 'notify = ["shared-notifier"]\n')
        before = tree_snapshot(self.root)
        with self.assertRaises(harness.HarnessError):
            self.build()
        self.assertEqual(tree_snapshot(self.root), before)

    def test_line_ending_and_bom_differences_alone_do_not_rewrite_config(self):
        plan = self.build()
        config_path = self.fixture.codex / "config.toml"
        merged = next(change.after for change in plan.changes if change.path == config_path)
        write_file(config_path, b"\xef\xbb\xbf" + merged.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
        before = config_path.read_bytes()
        next_plan = self.build()
        self.assertNotIn(config_path, [change.path for change in next_plan.changes])
        self.assertEqual(config_path.read_bytes(), before)

    def test_local_agents_override_blocks_apply_but_keeps_file_list(self):
        write_file(self.fixture.codex / "AGENTS.override.md", "# Local override\n")
        plan = self.build()
        self.assertTrue(any("AGENTS.override.md" in message for message in plan.missing))
        self.assertEqual({change.path for change in plan.changes}, self.fixture.expected_targets())
        before = tree_snapshot(self.root)
        with self.assertRaises(harness.HarnessError):
            harness.apply_plan(plan)
        self.assertEqual(tree_snapshot(self.root), before)


class BrowserOwnershipTests(TemporaryHarnessTestCase):
    def test_ego_absent_present_or_linked_elsewhere_is_never_accessed(self):
        for state in ("absent", "present", "linked-elsewhere"):
            with self.subTest(state=state):
                self.fixture = FakeRepository(self.root / state)
                app = self.fixture.home / ".local/share/ego"
                skill = self.fixture.home / ".agents/skills/ego-browser"
                elsewhere = self.root / state / "app-managed skill elsewhere"
                if state != "absent":
                    write_file(app / "ego-skills/SKILL.md", b"app-owned skill")
                    write_file(app / "version.json", b'{"version":"app-controlled"}')
                    if state == "present":
                        write_file(skill / "SKILL.md", b"independent app-owned skill")
                    else:
                        write_file(elsewhere / "SKILL.md", b"linked app-owned skill")
                        self.make_directory_link(skill, elsewhere)
                protected = (app, skill, elsewhere)
                before = {path: tree_snapshot(path) for path in protected}

                def guard(method):
                    def checked(path, *args, **kwargs):
                        if any(path.is_relative_to(root) for root in protected):
                            self.fail(f"Harness accessed browser-owned path through {method.__name__}: {path}")
                        return method(path, *args, **kwargs)
                    return checked

                with ExitStack() as stack:
                    for name in (
                        "open", "stat", "lstat", "exists", "is_file", "is_dir",
                        "is_symlink", "is_junction", "iterdir", "glob", "rglob",
                        "readlink", "resolve", "samefile", "mkdir", "touch",
                        "unlink", "rmdir", "rename", "replace", "chmod",
                    ):
                        if hasattr(Path, name):
                            stack.enter_context(mock.patch.object(Path, name, guard(getattr(Path, name))))
                    plan = self.build()
                    self.assertEqual(plan.missing, [])
                    self.assertEqual({change.path for change in plan.changes}, self.fixture.expected_targets())
                    backup = harness.apply_plan(plan)
                    self.assertIsInstance(backup, Path)
                    second = self.build()
                    self.assertEqual(second.missing, [])
                    self.assertEqual(second.changes, [])
                    self.assertIsNone(harness.apply_plan(second))
                self.assertEqual({path: tree_snapshot(path) for path in protected}, before)
                self.process.assert_not_called()

    def test_cli_summary_and_check_use_only_files_and_missing_prerequisites(self):
        with mock.patch.object(harness, "REPO", self.fixture.repo):
            with mock.patch("sys.stdout", new_callable=io.StringIO):
                self.assertEqual(harness.main([
                    "check", "--host", "roylabs-desktop", "--home", str(self.fixture.home),
                ]), 1)
            for command in ("plan", "apply", "check"):
                with self.subTest(command=command), mock.patch("sys.stdout", new_callable=io.StringIO) as output:
                    result = harness.main([
                        command, "--host", "roylabs-desktop", "--home", str(self.fixture.home),
                    ])
                    self.assertEqual(result, 0)
                    self.assertRegex(output.getvalue(), r"[0-9]+ files, 0 missing prerequisites")
                    self.assertNotIn(" links", output.getvalue())
                    self.assertNotIn("LINK ", output.getvalue())


class ApplyPlanTests(TemporaryHarnessTestCase):
    def test_missing_prerequisites_prevent_every_write_even_for_an_empty_plan(self):
        self.fixture = FakeRepository(self.root / "missing", ready=False)
        for has_changes in (True, False):
            with self.subTest(has_changes=has_changes):
                plan = self.build() if has_changes else self.simple_plan()
                if not has_changes:
                    plan.missing.append("missing local runtime")
                before = tree_snapshot(self.root)
                with mock.patch.object(harness, "atomic_write") as write:
                    with self.assertRaises(harness.HarnessError):
                        harness.apply_plan(plan)
                    write.assert_not_called()
                self.assertEqual(tree_snapshot(self.root), before)
                self.assertFalse(self.fixture.home.exists())

    def test_apply_backs_up_original_bytes_and_second_plan_has_no_changes(self):
        fixture = self.fixture
        plan = self.build()
        changes = {change.path: change for change in plan.changes}
        unmanaged = {path: path.read_bytes() for path in (
            fixture.home / "unrelated.txt", fixture.codex / "skills/unrelated/SKILL.md",
        )}
        backup = harness.apply_plan(plan)
        self.assertIsInstance(backup, Path)
        self.assertEqual(backup.parent, fixture.codex / "harness-backups")
        manifest = json.loads((backup / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["host"], "roylabs-desktop")
        self.assertEqual(manifest["status"], "applied")
        self.assertEqual({Path(record["path"]) for record in manifest["files"]}, set(changes))
        self.assertEqual(len(manifest["files"]), len(changes))
        for record in manifest["files"]:
            change = changes[Path(record["path"])]
            with self.subTest(path=change.path):
                self.assertEqual(change.path.read_bytes(), change.after)
                self.assertEqual(record["installed_sha256"], hashlib.sha256(change.after).hexdigest())
                if change.before is None:
                    self.assertIsNone(record["backup"])
                else:
                    self.assertEqual((backup / record["backup"]).read_bytes(), change.before)
        original_config = changes[fixture.codex / "config.toml"].before
        self.assertTrue(original_config.startswith(b"\xef\xbb\xbf"))
        self.assertIn(b"\r\n", original_config)
        for (skill, relative), payload in fixture.skill_files.items():
            root = fixture.home / ".agents" if skill == "create-readme" else fixture.codex
            self.assertEqual((root / "skills" / skill / relative).read_bytes(), payload)
        for path, content in unmanaged.items():
            self.assertEqual(path.read_bytes(), content)
        before = tree_snapshot(self.root)
        second = self.build()
        self.assertEqual(second.missing, [])
        self.assertEqual(second.changes, [])
        self.assertIsNone(harness.apply_plan(second))
        self.assertEqual(tree_snapshot(self.root), before)
        self.process.assert_not_called()

    def test_removed_upstream_file_is_deleted_only_after_an_unchanged_recorded_deployment(self):
        for legacy_receipt in (False, True):
            with self.subTest(legacy_receipt=legacy_receipt):
                self.fixture = FakeRepository(self.root / str(legacy_receipt))
                first_backup = harness.apply_plan(self.build())
                if legacy_receipt:
                    manifest_path = first_backup / "manifest.json"
                    manifest = json.loads(manifest_path.read_text())
                    manifest.pop("status")
                    manifest_path.write_text(json.dumps(manifest))
                relative = "skills/agent-desktop/scripts/payload.bin"
                source = self.fixture.repo / relative
                target = self.fixture.codex / relative
                installed = target.read_bytes()
                source.unlink()
                plan = self.build()
                self.assertEqual(plan.missing, [])
                self.assertEqual([(change.path, change.after) for change in plan.changes], [(target, None)])
                backup = harness.apply_plan(plan)
                self.assertFalse(target.exists())
                manifest = json.loads((backup / "manifest.json").read_text())
                self.assertEqual(manifest["status"], "applied")
                record, = manifest["files"]
                self.assertIsNone(record["installed_sha256"])
                self.assertEqual((backup / record["backup"]).read_bytes(), installed)
                self.assertNotIn(str(target), harness.previously_applied_files(self.fixture.codex))
                self.assertEqual(self.build().changes, [])

    def test_removed_upstream_file_with_user_edits_is_preserved_and_blocks_apply(self):
        harness.apply_plan(self.build())
        relative = "skills/agent-desktop/scripts/payload.bin"
        (self.fixture.repo / relative).unlink()
        target = self.fixture.codex / relative
        target.write_bytes(b"user modified this previously deployed file")
        plan = self.build()
        self.assertTrue(any("Unmanaged files" in item for item in plan.missing))
        self.assertNotIn(target, [change.path for change in plan.changes])
        before = tree_snapshot(self.root)
        with self.assertRaises(harness.HarnessError):
            harness.apply_plan(plan)
        self.assertEqual(tree_snapshot(self.root), before)

    def test_unrecorded_extra_file_is_preserved_even_when_a_pending_or_failed_receipt_matches(self):
        harness.apply_plan(self.build())
        target = write_file(self.fixture.codex / "skills/agent-desktop/custom.txt", b"user addition")
        manifest_path = self.fixture.codex / "harness-backups/zz-unfinished/manifest.json"
        for status in ("pending", "failed"):
            with self.subTest(status=status):
                write_file(manifest_path, json.dumps({"status": status, "files": [{
                    "path": str(target), "installed_sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                }]}))
                plan = self.build()
                self.assertTrue(any("Unmanaged files" in item for item in plan.missing))
                self.assertNotIn(target, [change.path for change in plan.changes])
                before = tree_snapshot(self.root)
                with self.assertRaises(harness.HarnessError):
                    harness.apply_plan(plan)
                self.assertEqual(tree_snapshot(self.root), before)

    def test_deleted_file_is_restored_when_a_later_change_fails(self):
        removed = write_file(self.fixture.codex / "rollback/removed.bin", b"original removed bytes")
        last = write_file(self.fixture.codex / "rollback/last.bin", b"last original")
        plan = self.simple_plan([self.change(removed, None), self.change(last, b"replacement")])
        real_replace = os.replace

        def fail_last_replacement(source, destination):
            if Path(destination) == last:
                raise OSError("injected failure after deletion")
            return real_replace(source, destination)

        with mock.patch.object(harness.os, "replace", side_effect=fail_last_replacement):
            with self.assertRaisesRegex(OSError, "injected failure after deletion"):
                harness.apply_plan(plan)
        self.assertEqual(removed.read_bytes(), b"original removed bytes")
        self.assertEqual(last.read_bytes(), b"last original")
        self.assertEqual(harness.previously_applied_files(self.fixture.codex), {})

    def test_empty_plan_is_a_noop_and_does_not_create_a_backup(self):
        before = tree_snapshot(self.root)
        self.assertIsNone(harness.apply_plan(self.simple_plan()))
        self.assertEqual(tree_snapshot(self.root), before)

    def test_stale_file_edits_creations_and_deletions_abort_before_any_write(self):
        for mutation in ("edit", "create", "delete"):
            with self.subTest(mutation=mutation):
                self.fixture = FakeRepository(self.root / mutation)
                plan = self.build()
                if mutation == "create":
                    selected = next(change for change in plan.changes if change.before is None)
                    write_file(selected.path, b"created since planning")
                else:
                    selected = next(change for change in reversed(plan.changes) if change.before is not None)
                    if mutation == "edit":
                        selected.path.write_bytes(b"user edit since planning\r\n")
                    else:
                        selected.path.unlink()
                before = tree_snapshot(self.root)
                with mock.patch.object(harness, "atomic_write") as write:
                    with self.assertRaisesRegex(harness.HarnessError, "changed after planning"):
                        harness.apply_plan(plan)
                    write.assert_not_called()
                self.assertEqual(tree_snapshot(self.root), before)

    def test_failed_atomic_replacement_restores_old_files_removes_new_files_and_cleans_temps(self):
        first = write_file(self.fixture.codex / "rollback/first.bin", b"\xef\xbb\xbforiginal\r\n\xff")
        created = self.fixture.codex / "rollback/new.bin"
        last = write_file(self.fixture.codex / "rollback/last.bin", b"last original\x00")
        originals = {first: first.read_bytes(), last: last.read_bytes()}
        plan = self.simple_plan([
            self.change(first, b"first replacement"),
            self.change(created, b"new content"),
            self.change(last, b"last replacement"),
        ])
        real_replace = os.replace

        def fail_last_replacement(source, destination):
            if Path(destination) == last:
                raise OSError("injected atomic replace failure")
            return real_replace(source, destination)

        with mock.patch.object(harness.os, "replace", side_effect=fail_last_replacement):
            with self.assertRaisesRegex(OSError, "injected atomic replace failure"):
                harness.apply_plan(plan)
        for path, content in originals.items():
            self.assertEqual(path.read_bytes(), content)
        self.assertFalse(created.exists())
        self.assertEqual(list(self.fixture.codex.rglob(".harness-*")), [])
        backups = list((self.fixture.codex / "harness-backups").iterdir())
        self.assertEqual(len(backups), 1)
        manifest = json.loads((backups[0] / "manifest.json").read_text())
        for record in manifest["files"]:
            if record["backup"]:
                self.assertEqual((backups[0] / record["backup"]).read_bytes(), originals[Path(record["path"])])


class LinkSafetyTests(TemporaryHarnessTestCase):
    def test_build_refuses_a_skill_destination_below_a_directory_link(self):
        outside = self.root / "outside managed roots"
        write_file(outside / "SKILL.md", b"external skill must survive")
        destination = self.fixture.codex / "skills/agent-desktop-windows"
        self.make_directory_link(destination, outside)
        before = tree_snapshot(self.root)
        with self.assertRaises(harness.HarnessError):
            self.build()
        self.assertEqual(tree_snapshot(self.root), before)

    def test_build_refuses_a_link_at_the_agents_managed_root_itself(self):
        outside = self.root / "outside agents"
        write_file(outside / "sentinel", b"external data")
        self.make_directory_link(self.fixture.home / ".agents", outside)
        before = tree_snapshot(self.root)
        with self.assertRaises(harness.HarnessError):
            self.build()
        self.assertEqual(tree_snapshot(self.root), before)

    def test_apply_rechecks_file_parent_links_added_after_planning(self):
        parent = self.fixture.codex / "replaced-parent"
        target = write_file(parent / "settings.bin", b"unchanged original")
        plan = self.simple_plan([self.change(target, b"replacement")])
        target.unlink()
        parent.rmdir()
        outside = self.root / "external parent"
        external = write_file(outside / "settings.bin", b"unchanged original")
        self.make_directory_link(parent, outside)
        before = tree_snapshot(self.root)
        with mock.patch.object(harness, "atomic_write") as write:
            with self.assertRaises(harness.HarnessError):
                harness.apply_plan(plan)
            write.assert_not_called()
        self.assertEqual(external.read_bytes(), b"unchanged original")
        self.assertEqual(tree_snapshot(self.root), before)

    def test_apply_refuses_an_external_file_symlink(self):
        external = write_file(self.root / "external file.bin", b"external original")
        target = self.fixture.codex / "symlink-file.bin"
        try:
            target.symlink_to(external)
        except OSError as exc:
            if os.name == "nt" and getattr(exc, "winerror", None) == 1314:
                self.skipTest("File symlinks require Windows Developer Mode or symlink privilege; directory junctions are tested separately")
            raise
        self.addCleanup(target.unlink)
        plan = self.simple_plan([harness.FileChange(target, b"external original", b"replacement", self.fixture.codex)])
        before = tree_snapshot(self.root)
        with self.assertRaises(harness.HarnessError):
            harness.apply_plan(plan)
        self.assertEqual(external.read_bytes(), b"external original")
        self.assertEqual(tree_snapshot(self.root), before)

    def test_apply_refuses_a_managed_root_replaced_with_a_directory_link(self):
        managed_root = self.fixture.home / ".agents"
        target = managed_root / "skills/new-skill/SKILL.md"
        plan = self.simple_plan([harness.FileChange(target, None, b"must stay inside root", managed_root)])
        outside = self.root / "external agents root"
        write_file(outside / "sentinel", b"external original")
        self.make_directory_link(managed_root, outside)
        before = tree_snapshot(self.root)
        with self.assertRaises(harness.HarnessError):
            harness.apply_plan(plan)
        self.assertEqual(tree_snapshot(self.root), before)

    def test_apply_rechecks_managed_file_parents_before_writing_any_files(self):
        plan = self.build()
        outside = self.root / "external link parent"
        write_file(outside / "sentinel", b"external original")
        self.make_directory_link(self.fixture.home / ".agents/skills", outside)
        before = tree_snapshot(self.root)
        with mock.patch.object(harness, "atomic_write") as write:
            with self.assertRaises(harness.HarnessError):
                harness.apply_plan(plan)
            write.assert_not_called()
        self.assertEqual(tree_snapshot(self.root), before)

    def test_apply_refuses_a_backup_directory_link_outside_the_managed_home(self):
        target = write_file(self.fixture.codex / "backup-safety.bin", b"original")
        plan = self.simple_plan([self.change(target, b"replacement")])
        outside = self.root / "external backups"
        write_file(outside / "sentinel", b"external original")
        self.make_directory_link(self.fixture.codex / "harness-backups", outside)
        before = tree_snapshot(self.root)
        with self.assertRaises(harness.HarnessError):
            harness.apply_plan(plan)
        self.assertEqual(target.read_bytes(), b"original")
        self.assertEqual(tree_snapshot(self.root), before)


if __name__ == "__main__":
    unittest.main()
