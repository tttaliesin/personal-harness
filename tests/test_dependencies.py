"""Offline tests for the dependency preview, integrity checks and local overrides."""
from contextlib import redirect_stdout
import hashlib
import io
import json
from pathlib import Path
import sys
import tarfile
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import install_dependencies as installer
import tomlkit


class DependencyTests(unittest.TestCase):
    def test_locked_preview_creates_nothing_and_never_installs_or_downloads(self):
        with TemporaryDirectory() as directory:
            repo = Path(directory)
            sources = repo / "sources"
            sources.mkdir()
            sources.joinpath("dependencies.lock.json").write_bytes(
                installer.REPO.joinpath("sources/dependencies.lock.json").read_bytes())
            before = set(repo.rglob("*"))
            with patch.object(installer, "REPO", repo), patch.object(installer, "find_codex", return_value=None), \
                    patch.object(installer, "install_agent") as agent, \
                    patch.object(installer, "install_codegraph") as graph, \
                    patch.object(installer, "install_plugins") as plugins, \
                    patch.object(installer.urllib.request, "urlopen") as network, redirect_stdout(io.StringIO()):
                self.assertEqual(installer.main(["--host", "homelab-desktop", "--locked", "--codex-home", str(repo / "fake-home")]), 0)
                for call in (agent, graph, plugins, network):
                    call.assert_not_called()
            self.assertEqual(before, set(repo.rglob("*")))

    def make_archive(self, local, executable=b"test executable"):
        data = io.BytesIO()
        with tarfile.open(fileobj=data, mode="w:gz") as archive:
            for name, content in (("agent-desktop.exe", executable), ("../../outside.txt", b"never extract me")):
                member = tarfile.TarInfo(name)
                member.size = len(content)
                archive.addfile(member, io.BytesIO(content))
        sha256 = hashlib.sha256(data.getvalue()).hexdigest()
        package = local / f"downloads/agent-desktop-v1.0.2-{sha256}.tar.gz"
        package.parent.mkdir(parents=True)
        package.write_bytes(data.getvalue())
        return {"version": "1.0.2", "sha256": sha256,
                "executable_sha256": hashlib.sha256(executable).hexdigest(), "url": "https://invalid.test/not-used"}

    def test_install_agent_verifies_both_hashes_and_extracts_only_the_executable(self):
        with TemporaryDirectory() as directory:
            local = Path(directory) / ".local"
            lock = self.make_archive(local)
            with patch.object(installer.urllib.request, "urlopen") as network:
                target = installer.install_agent(lock, local)
                self.assertEqual(target.read_bytes(), b"test executable")
                self.assertFalse((Path(directory) / "outside.txt").exists())
                self.assertEqual(installer.install_agent(lock, local), target)
                network.assert_not_called()

    def test_corrupted_archive_or_executable_is_rejected_before_installation(self):
        for field in ("sha256", "executable_sha256"):
            with self.subTest(field=field), TemporaryDirectory() as directory:
                local = Path(directory) / ".local"
                lock = self.make_archive(local)
                lock[field] = "0" * 64
                with patch.object(installer, "fetch", return_value=next((local / "downloads").iterdir()).read_bytes()):
                    with self.assertRaises(installer.HarnessError):
                        installer.install_agent(lock, local)
                self.assertFalse((local / "tools").exists())

    def test_local_paths_keep_private_overrides_and_comments(self):
        with TemporaryDirectory() as directory:
            local = Path(directory) / "local.toml"
            local.write_text('# keep this\n[paths]\nagent_desktop = "D:/existing.exe"\n\n[config.desktop]\nautoArchiveAfterDays = 9\n', encoding="utf-8")
            with redirect_stdout(io.StringIO()):
                installer.save_paths(local, Path("new-agent.exe"), Path("new-codegraph.cmd"))
            result = tomlkit.parse(local.read_text(encoding="utf-8"))
            self.assertEqual(result["paths"]["agent_desktop"], "D:/existing.exe")
            self.assertEqual(result["paths"]["codegraph"], "new-codegraph.cmd")
            self.assertEqual(result["config"]["desktop"]["autoArchiveAfterDays"], 9)
            self.assertIn("# keep this", local.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
