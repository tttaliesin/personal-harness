"""Offline release fixtures exercise resolution, installation ordering and source bytes."""
from contextlib import redirect_stderr, redirect_stdout, ExitStack
import copy
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import install_dependencies as installer
from registry import load_registry, declaration_hash, lock_issues
import tomlkit


def archive(executable=b"official exe"):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz") as package:
        member = tarfile.TarInfo("agent-desktop.exe")
        member.size = len(executable)
        package.addfile(member, io.BytesIO(executable))
    return output.getvalue()


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.lock = json.loads((installer.REPO / "sources/dependencies.lock.json").read_bytes())
        self.lock["update_policy"] = {"trigger": "on_command", "channel": "latest_stable"}
        self.commit = "a" * 40
        self.tag = "b" * 40
        self.urls = []
        self.package = archive()
        self.skill_files = {
            "LICENSE": b"official license\r\n",
            "skills/agent-desktop/SKILL.md": b"official skill\r\n",
            "skills/agent-desktop/references/read.md": b"reference\x00bytes",
            "skills/agent-desktop-windows/SKILL.md": b"official Windows skill\n",
        }

    def fetch(self, url):
        self.urls.append(url)
        if url.endswith("/releases/latest"):
            if "pstack" in url:
                version = "2.0.0"
            elif "elephant" in url:
                version = "3.0.0"
            else:
                version = "4.0.0"
            return json.dumps({"tag_name": "v" + version, "draft": False, "prerelease": False,
                "assets": [{"name": "agent-desktop-v4.0.0-x86_64-pc-windows-msvc.tar.gz",
                            "browser_download_url": "https://fixtures.test/agent.tar.gz",
                            "digest": "sha256:" + installer.digest(self.package)}]}).encode()
        if "/git/ref/tags/" in url:
            return json.dumps({"object": {"type": "tag", "sha": self.tag}}).encode()
        if "/git/tags/" in url:
            return json.dumps({"object": {"type": "commit", "sha": self.commit}}).encode()
        if url.endswith("codegraph/latest"):
            return json.dumps({"name": "@colbymchenry/codegraph", "version": "5.0.0",
                               "dist": {"integrity": "sha512-fixture", "tarball": "https://fixtures.test/graph.tgz"}}).encode()
        if url.endswith("agent.tar.gz"):
            return self.package
        if "/git/trees/" in url:
            name, version = ("pstack", "2.0.0") if "pstack" in url else ("egm", "3.0.0")
            files = self.skill_files if "agent-desktop" in url else {
                ".codex-plugin/plugin.json": json.dumps({"name": name, "version": version}).encode()}
            if "pstack" in url:
                files = {"plugins/pstack/" + path: data for path, data in files.items()}
            return json.dumps({"tree": [{"path": path, "mode": "100644", "type": "blob",
                               "sha": installer.blob_digest(data)} for path, data in files.items()]}).encode()
        if url.endswith("plugin.json"):
            name, version = ("pstack", "2.0.0") if "pstack" in url else ("egm", "3.0.0")
            return json.dumps({"name": name, "version": version}).encode()
        for path, data in self.skill_files.items():
            if url.endswith("/" + path):
                return data
        raise AssertionError(f"Unexpected HTTP request: {url}")

    def resolve(self):
        with patch.object(installer, "fetch", side_effect=self.fetch):
            return installer.resolve(self.lock)

    def desired(self, directory, *, plugins=None, mcp=None):
        path = Path(directory) / "registry.toml"
        path.write_text(tomlkit.dumps({"schema_version": 1, "plugins": plugins or [], "mcp": mcp or []}), encoding="utf-8")
        return load_registry(path)

    def test_new_registry_membership_replaces_old_lock_membership_on_default_update(self):
        with TemporaryDirectory() as directory:
            plugins = [{"name": "third-party", "marketplace": "third-market", "source": "https://github.com/third/market.git",
                        "manifest": "extensions/third-party/plugin.json", "channel": "latest-release", "enabled": False}]
            mcp = [{"name": "remote", "kind": "http", "url": "https://example.test/mcp", "bearer_token_env_var": "EXAMPLE_TOKEN"}]
            desired = self.desired(directory, plugins=plugins, mcp=mcp)
            data = json.dumps({"name": "third-party", "version": "6.0.0"}).encode()

            def fetch(url):
                if "/third/market/" in url:
                    if url.endswith("/releases/latest"):
                        return b'{"tag_name":"v6.0.0"}'
                    if "/git/ref/tags/" in url:
                        return json.dumps({"object": {"type": "commit", "sha": self.commit}}).encode()
                    if "/git/trees/" in url:
                        return json.dumps({"tree": [{"path": "extensions/third-party/plugin.json", "type": "blob",
                                                     "mode": "100644", "sha": installer.blob_digest(data)}]}).encode()
                    if url.endswith("plugin.json"):
                        return data
                return self.fetch(url)

            record = {"name": "remote", "kind": "http", "declaration": desired.mcp[0],
                      "declaration_sha256": declaration_hash(desired.mcp[0])}
            with patch.object(installer, "fetch", side_effect=fetch), \
                    patch.object(installer.mcp_packages, "resolve", return_value=record) as resolve_mcp:
                result = installer.resolve(self.lock, registry=desired)
            resolve_mcp.assert_called_once_with(desired.mcp[0])
            self.assertEqual([p["name"] for p in result.lock["plugins"]], ["third-party"])
            self.assertEqual(result.lock["plugins"][0]["ref"], self.commit)
            self.assertEqual(result.lock["mcp"], [record])
            self.assertEqual(result.lock["registrations"], {"plugins": list(desired.plugins), "mcp": list(desired.mcp)})
            self.assertEqual(lock_issues(desired, result.lock), [])
            with patch.object(installer, "fetch", side_effect=AssertionError("locked metadata")), \
                    patch.object(installer.mcp_packages, "resolve", side_effect=AssertionError("locked package resolution")):
                replay = installer.resolve(result.lock, locked=True, registry=desired)
            self.assertEqual(replay.lock, result.lock)

    def test_locked_changed_declaration_rejects_before_resolution_or_installation(self):
        resolved = self.resolve()
        original = load_registry(installer.REPO / "registry.toml")
        for changes in ({"source": "https://github.com/changed/repo.git"}, {"enabled": False},
                        {"manifest": "changed/plugin.json"}, {"channel": "git-ref", "ref": "main"}):
            with self.subTest(changes=changes), TemporaryDirectory() as directory:
                plugins = [dict(spec) for spec in original.plugins]
                plugins[0].update(changes)
                desired = self.desired(directory, plugins=plugins)
                with patch.object(installer, "fetch", side_effect=AssertionError("locked metadata")), \
                        patch.object(installer.mcp_packages, "resolve", side_effect=AssertionError("package resolution")):
                    with self.assertRaisesRegex(installer.HarnessError, "ordinary update"):
                        installer.resolve(resolved.lock, locked=True, registry=desired)

    def test_git_ref_uses_arbitrary_https_repository_and_portable_manifest_boundary(self):
        with TemporaryDirectory() as directory:
            desired = self.desired(directory, plugins=[{"name": "portable", "marketplace": "custom",
                "source": "https://git.example.test/group/plugins.git", "channel": "git-ref", "ref": "refs/heads/main",
                "manifest": "plugins/portable/plugin.json"}])
            data = b'{"name":"portable","version":"1.0.0-dev"}'
            other = b"portable skill\n"
            tree = (f"100644 blob {installer.blob_digest(data)}\tplugins/portable/plugin.json\0"
                    f"100755 blob {installer.blob_digest(other)}\tplugins/portable/run.py\0"
                    f"100644 blob {'c' * 40}\tplugins/other/unrelated.txt\0").encode()
            calls = []

            def run(command, **kwargs):
                calls.append(command)
                if command[1] == "rev-parse":
                    output = (self.commit + "\n").encode()
                elif command[1] == "ls-tree":
                    output = tree
                elif command[1] == "show":
                    output = data
                else:
                    output = b""
                return subprocess.CompletedProcess(command, 0, output)

            with patch.object(installer.subprocess, "run", side_effect=run):
                record = installer.resolve_plugins(desired.plugins)[0]
            self.assertEqual(record["source"], desired.plugins[0]["source"])
            self.assertEqual(record["ref"], self.commit)
            self.assertEqual(record["version"], "1.0.0-dev")
            self.assertEqual(record["content_sha256"], installer.content_digest({
                "plugin.json": installer.blob_digest(data), "run.py": installer.blob_digest(other)}))
            self.assertIn(["git", "fetch", "--quiet", "--depth=1", "origin", "refs/heads/main"], calls)

    @unittest.skipUnless(installer.shutil.which("git"), "Git is required")
    def test_git_ref_reads_real_git_objects_and_hashes_from_isolated_repository(self):
        with TemporaryDirectory() as directory:
            source = Path(directory) / "source"
            source.mkdir()
            real_git = installer.git_output
            real_git(["init", "--quiet", str(source)])
            real_git(["config", "user.email", "fixture@example.invalid"], cwd=source)
            real_git(["config", "user.name", "Fixture"], cwd=source)
            manifest = source / "plugins/portable/plugin.json"
            manifest.parent.mkdir(parents=True)
            manifest.write_bytes(b'{"name":"portable","version":"1.0.0"}')
            (manifest.parent / "SKILL.md").write_bytes(b"real git bytes\n")
            real_git(["add", "."], cwd=source)
            real_git(["-c", "core.hooksPath=NUL", "commit", "--quiet", "--no-gpg-sign", "-m", "fixture"], cwd=source)
            commit = real_git(["rev-parse", "HEAD"], cwd=source).decode().strip()
            desired = self.desired(directory, plugins=[{"name": "portable", "marketplace": "portable",
                "source": "https://git.example.test/group/plugins.git", "channel": "git-ref", "ref": commit,
                "manifest": "plugins/portable/plugin.json"}])

            def git(arguments, **kwargs):
                if arguments[:3] == ["remote", "add", "origin"]:
                    arguments = [*arguments[:3], str(source)]
                return real_git(arguments, **kwargs)

            with patch.object(installer, "git_output", side_effect=git):
                record = installer.resolve_plugins(desired.plugins)[0]
            self.assertEqual(record["ref"], commit)
            self.assertEqual(record["content_sha256"], installer.content_digest({
                "plugin.json": installer.blob_digest(manifest.read_bytes()),
                "SKILL.md": installer.blob_digest((manifest.parent / "SKILL.md").read_bytes())}))

    def test_plugin_tree_rejects_windows_aliases_and_unrepresentable_components(self):
        spec = {"name": "portable", "marketplace": "custom", "source": "https://git.example.test/group/plugins.git",
                "channel": "git-ref", "ref": "main", "manifest": "plugins/portable/plugin.json"}
        data = b'{"name":"portable","version":"1.0.0"}'

        def entry(path, *, kind="blob", content=b"fixture"):
            return {"path": path, "type": kind, "mode": "040000" if kind == "tree" else "100644",
                    "sha": installer.blob_digest(content)}

        manifest = entry(spec["manifest"], content=data)
        invalid = [
            [entry("plugins/portable/Readme.txt"), entry("plugins/portable/README.txt", content=b"other")],
            [entry("plugins/portable/Docs/a.txt"), entry("plugins/portable/docs/b.txt")],
            [entry("plugins/portable/Docs", kind="tree"), entry("plugins/portable/docs/b.txt")],
            [entry("plugins/portable/docs"), entry("plugins/portable/docs/b.txt")],
            [entry("Plugins/other.txt")],
            [entry("plugins/other/NUL")],
            *([entry("plugins/portable/" + path)] for path in (
                "CON", "nul.txt", "COM1.log", "lpt9", "COM\u00b9.txt", "LPT\u00b2", "CONIN$", "CONOUT$.log",
                "CON .txt", "trailing.", "trailing ", "bad<name", "bad>name", 'bad"name', "bad|name",
                "bad?name", "bad*name", "bad\x00name", "bad\x1fname", "folder./file.txt", ".GIT/config",
                "x" * 256, "\U0001f600" * 128)),
        ]
        for entries in invalid:
            with self.subTest(paths=[item["path"] for item in entries]):
                with self.assertRaisesRegex(installer.HarnessError, "Unsupported plugin source entry"):
                    installer.plugin_record(spec, self.commit, data, [manifest, *entries], basis="Registry Git ref")
        valid = [manifest, entry("plugins/portable/docs", kind="tree"),
                 entry("plugins/portable/docs/a.txt"), entry("plugins/portable/docs/b.txt"),
                 entry("plugins/portable/CONSOLE.txt"), entry("plugins/portable/COM10"),
                 entry("plugins/portable/\ud55c\uae00.txt")]
        record = installer.plugin_record(spec, self.commit, data, valid, basis="Registry Git ref")
        self.assertEqual(record["content_sha256"], installer.content_digest({
            item["path"].removeprefix("plugins/portable/"): item["sha"]
            for item in valid if item["type"] == "blob"}))

    @unittest.skipUnless(installer.shutil.which("git"), "Git is required")
    def test_real_git_case_aliases_fail_before_installation_or_profile_mutation(self):
        for files in ({"Readme.txt": b"first", "README.txt": b"second"},
                      {"Docs": {"a.txt": b"first"}, "docs": {"b.txt": b"second"}}):
            with self.subTest(files=files), TemporaryDirectory() as directory:
                repo = self.make_repo(Path(directory) / "repo")
                source = Path(directory) / "source"
                real_git = installer.git_output
                real_git(["init", "--quiet", str(source)])
                real_git(["config", "user.email", "fixture@example.invalid"], cwd=source)
                real_git(["config", "user.name", "Fixture"], cwd=source)

                def object_id(command, data):
                    return subprocess.run(["git", *command], input=data, cwd=source, check=True,
                                          capture_output=True).stdout.decode().strip()

                def tree(entries):
                    rows = []
                    for name, value in sorted(entries.items()):
                        if isinstance(value, dict):
                            mode, kind, sha = "040000", "tree", tree(value)
                        else:
                            mode, kind, sha = "100644", "blob", object_id(["hash-object", "-w", "--stdin"], value)
                        rows.append(f"{mode} {kind} {sha}\t{name}\0".encode())
                    return object_id(["mktree", "-z"], b"".join(rows))

                root = tree({"plugin.json": b'{"name":"portable","version":"1.0.0"}', **files})
                commit = object_id(["-c", "core.hooksPath=NUL", "commit-tree", root], b"fixture\n")
                desired = self.desired(repo, plugins=[{"name": "portable", "marketplace": "portable",
                    "source": "https://git.example.test/group/plugins.git", "channel": "git-ref", "ref": commit,
                    "manifest": "plugin.json"}])
                before = {p.relative_to(repo): p.read_bytes() for p in repo.rglob("*") if p.is_file()}

                def git(arguments, **kwargs):
                    if arguments[:3] == ["remote", "add", "origin"]:
                        arguments = [*arguments[:3], str(source)]
                    return real_git(arguments, **kwargs)

                with ExitStack() as stack:
                    stack.enter_context(patch.object(installer, "git_output", side_effect=git))
                    stack.enter_context(patch.object(installer, "fetch", side_effect=AssertionError("network")))
                    operations = [stack.enter_context(patch.object(installer, name)) for name in (
                        "install_agent", "install_codegraph", "install_plugins", "sync_sources", "save_paths")]
                    operations.append(stack.enter_context(patch.object(installer.mcp_packages, "install")))
                    with self.assertRaisesRegex(installer.HarnessError, "Unsupported plugin source entry"):
                        installer.resolve_plugins(desired.plugins)
                    self.assertEqual(self.run_main(repo, "--install"), 2)
                for operation in operations:
                    operation.assert_not_called()
                self.assertEqual({p.relative_to(repo): p.read_bytes() for p in repo.rglob("*") if p.is_file()}, before)
                self.assertFalse((repo / "fake home").exists())
                self.assertFalse((repo / ".local").exists())

    def test_latest_resolves_exact_commits_versions_digests_and_complete_skill_bytes(self):
        old = copy.deepcopy(self.lock)
        result = self.resolve()
        self.assertEqual(self.lock, old)
        self.assertNotIn("ego_lite", result.lock)
        self.assertEqual(result.lock["update_policy"], self.lock["update_policy"])
        self.assertEqual({p["name"]: p["version"] for p in result.lock["plugins"]}, {"pstack": "2.0.0", "egm": "3.0.0"})
        self.assertEqual(result.lock["plugins"][1]["ref"], self.commit)
        self.assertTrue(any(f"/git/tags/{self.tag}" in url for url in self.urls))
        self.assertEqual(result.lock["codegraph"]["version"], "5.0.0")
        self.assertEqual(result.lock["agent_desktop"]["sha256"], installer.digest(self.package))
        self.assertEqual(result.files["sources/agent-desktop-LICENSE"], self.skill_files["LICENSE"])
        for path, data in result.files.items():
            self.assertEqual(result.lock["agent_desktop"]["files_sha256"][path], installer.digest(data))

    def test_release_rejects_drafts_prereleases_and_nonstable_tags(self):
        for overrides in ({"draft": True}, {"prerelease": True}, {"tag_name": "v1.0.0-rc.1"}):
            with self.subTest(overrides=overrides):
                metadata = {"draft": False, "prerelease": False, "tag_name": "v1.0.0", **overrides}
                with patch.object(installer, "github", return_value=metadata):
                    with self.assertRaises(installer.HarnessError):
                        installer.release("official/repo")

    def test_manifest_release_disagreement_fails(self):
        def fetch(url):
            return b'{"name":"pstack","version":"0.0.0"}' if url.endswith("plugin.json") else self.fetch(url)
        with patch.object(installer, "fetch", side_effect=fetch):
            with self.assertRaisesRegex(installer.HarnessError, "disagreement"):
                installer.resolve(self.lock)

    def test_asset_digest_and_symlink_source_are_rejected(self):
        for failure in ("digest", "symlink"):
            with self.subTest(failure=failure):
                def fetch(url):
                    data = self.fetch(url)
                    if "agent-desktop/releases/latest" in url and failure == "digest":
                        value = json.loads(data)
                        value["assets"][0]["digest"] = "sha256:" + "0" * 64
                        return json.dumps(value).encode()
                    if "agent-desktop/git/trees" in url and failure == "symlink":
                        value = json.loads(data)
                        value["tree"][1]["mode"] = "120000"
                        return json.dumps(value).encode()
                    return data
                with patch.object(installer, "fetch", side_effect=fetch):
                    with self.assertRaises(installer.HarnessError):
                        installer.resolve(self.lock)

    def test_two_agent_upgrades_use_separate_version_and_hash_caches(self):
        with TemporaryDirectory() as directory, patch.object(installer, "fetch") as network:
            local = Path(directory)
            for version, executable in (("1.0.0", b"first"), ("2.0.0", b"second")):
                data = archive(executable)
                lock = {"version": version, "sha256": installer.digest(data),
                        "executable_sha256": installer.digest(executable), "url": "https://fixtures.test/download"}
                network.return_value = data
                self.assertEqual(installer.install_agent(lock, local).read_bytes(), executable)
                installer.install_agent(lock, local)
            self.assertEqual(network.call_count, 2)
            self.assertEqual(len(list((local / "downloads").glob("*.tar.gz"))), 2)

    def make_repo(self, directory):
        repo = Path(directory)
        (repo / "sources").mkdir(parents=True)
        (repo / "sources/dependencies.lock.json").write_text(json.dumps(self.lock))
        (repo / "registry.toml").write_bytes((installer.REPO / "registry.toml").read_bytes())
        return repo

    def run_main(self, repo, *args):
        with patch.object(installer, "REPO", repo), patch.object(installer, "find_codex", return_value="codex"), \
                redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            return installer.main(["--host", "homelab-desktop", "--codex-home", str(repo / "fake home"), *args])

    def test_default_preview_performs_http_but_has_no_disk_home_or_subprocess_writes(self):
        with TemporaryDirectory() as directory:
            repo = self.make_repo(directory)
            before = {p.relative_to(repo): p.read_bytes() for p in repo.rglob("*") if p.is_file()}
            with patch.object(installer, "fetch", side_effect=self.fetch), \
                    patch.object(installer, "atomic_write", side_effect=AssertionError("preview writes")), \
                    patch.object(installer.subprocess, "run", side_effect=AssertionError("preview executes")):
                self.assertEqual(self.run_main(repo), 0)
            self.assertTrue(self.urls)
            self.assertEqual(before, {p.relative_to(repo): p.read_bytes() for p in repo.rglob("*") if p.is_file()})
            self.assertFalse((repo / "fake home").exists())
            self.assertFalse((repo / ".local").exists())

    def test_locked_resolution_performs_no_http(self):
        with patch.object(installer, "fetch", side_effect=AssertionError("locked HTTP")):
            result = installer.resolve(self.lock, locked=True)
        for old, adopted in zip(self.lock["plugins"], result.lock["plugins"]):
            self.assertEqual(old, {key: value for key, value in adopted.items()
                                   if key not in ("declaration", "declaration_sha256")})
        self.assertEqual(result.lock["schema_version"], 2)
        self.assertIsNone(result.archive)

    def test_latest_query_failure_preserves_old_lock_without_fallback(self):
        with TemporaryDirectory() as directory:
            repo = self.make_repo(directory)
            old = (repo / "sources/dependencies.lock.json").read_bytes()
            with patch.object(installer, "fetch", side_effect=OSError("offline")), \
                    patch.object(installer, "install_agent") as install:
                self.assertEqual(self.run_main(repo, "--install"), 2)
                install.assert_not_called()
            self.assertEqual((repo / "sources/dependencies.lock.json").read_bytes(), old)

    def test_lock_is_written_only_after_every_install_source_sync_and_paths_succeed(self):
        result = self.resolve()
        operations = ("install_agent", "install_codegraph", "install_plugins", "sync_sources", "save_paths")
        for failing in (*operations, None):
            with self.subTest(failing=failing), TemporaryDirectory() as directory:
                repo = self.make_repo(directory)
                lock_path = repo / "sources/dependencies.lock.json"
                old = lock_path.read_bytes()
                with ExitStack() as stack:
                    stack.enter_context(patch.object(installer, "resolve", return_value=result))
                    stack.enter_context(patch.object(installer.platform, "machine", return_value="AMD64"))
                    stack.enter_context(patch.object(installer.shutil, "which", return_value="tool"))
                    for name in operations:
                        def operation(*args, name=name):
                            self.assertEqual(lock_path.read_bytes(), old)
                            if name == failing:
                                raise installer.HarnessError("fixture failure")
                            return repo / name
                        stack.enter_context(patch.object(installer, name, side_effect=operation))
                    self.assertEqual(self.run_main(repo, "--install"), 2 if failing else 0)
                self.assertEqual(lock_path.read_bytes(), old) if failing else self.assertEqual(json.loads(lock_path.read_bytes()), result.lock)

    def test_sync_preserves_official_bytes_backs_up_and_removes_stale_managed_files(self):
        result = self.resolve()
        with TemporaryDirectory() as directory:
            repo = Path(directory)
            stale = repo / "skills/agent-desktop/old.txt"
            stale.parent.mkdir(parents=True)
            stale.write_bytes(b"old source")
            with patch.object(installer, "fetch", side_effect=AssertionError("already staged")):
                installer.sync_sources(result, repo)
            self.assertFalse(stale.exists())
            self.assertEqual(next((repo / ".local/source-backups").rglob("old.txt")).read_bytes(), b"old source")
            for path, data in result.files.items():
                self.assertEqual((repo / path).read_bytes(), data)
            with patch.object(installer, "atomic_write", side_effect=AssertionError("unchanged sources write")):
                installer.sync_sources(result, repo)
            self.assertEqual(len(list((repo / ".local/source-backups").iterdir())), 1)

    def test_sync_shape_conflicts_preserve_the_entire_old_tree_before_any_write(self):
        for conflict in ("file_to_directory", "directory_to_file"):
            with self.subTest(conflict=conflict), TemporaryDirectory() as directory:
                result = self.resolve()
                result.files = dict(sorted(result.files.items()))
                repo = self.make_repo(directory)
                conflict_path = "skills/agent-desktop/references/read.md"
                earlier_path = next(iter(result.files))
                self.assertLess(earlier_path, conflict_path)
                for path in result.files:
                    if path == conflict_path:
                        continue
                    target = repo / path
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(b"old managed bytes\r\n")
                if conflict == "file_to_directory":
                    (repo / conflict_path).parent.write_bytes(b"old file blocking a new directory")
                else:
                    target = repo / conflict_path
                    target.mkdir(parents=True)
                    (target / "old.txt").write_bytes(b"old directory contents\x00")
                stale = repo / "skills/agent-desktop/stale.txt"
                stale.write_bytes(b"stale managed bytes")

                def snapshot():
                    return {path.relative_to(repo).as_posix(): path.read_bytes() if path.is_file() else None
                            for path in repo.rglob("*")}

                before = snapshot()
                with patch.object(installer, "fetch", side_effect=AssertionError("already staged")):
                    with self.assertRaisesRegex(installer.HarnessError, "file/directory shape"):
                        installer.sync_sources(result, repo)
                self.assertEqual(snapshot(), before)
                self.assertFalse((repo / ".local/source-backups").exists())

    def test_locked_source_sync_fetches_exact_commit_and_verifies_recorded_hashes(self):
        result = self.resolve()
        result.files.clear()
        with TemporaryDirectory() as directory, patch.object(installer, "fetch", side_effect=self.fetch):
            installer.sync_sources(result, Path(directory))
            self.assertEqual((Path(directory) / "skills/agent-desktop/SKILL.md").read_bytes(), self.skill_files["skills/agent-desktop/SKILL.md"])
            result.lock["agent_desktop"]["files_sha256"]["skills/agent-desktop/SKILL.md"] = "0" * 64
            with self.assertRaisesRegex(installer.HarnessError, "digest mismatch"):
                installer.sync_sources(result, Path(directory))

    def test_marketplace_ref_change_uses_official_remove_add_and_checks_config_and_head(self):
        plugin = self.lock["plugins"][0]
        with TemporaryDirectory() as directory:
            home = Path(directory)
            config = home / "config.toml"
            config.write_text(f'[marketplaces.pstack-claude]\nsource = "{plugin["source"]}"\nref = "old"\n')
            calls = []
            def run(command, **kwargs):
                calls.append(command)
                self.assertEqual(kwargs["env"]["CODEX_HOME"], str(home))
                if command[1:4] == ["plugin", "marketplace", "add"]:
                    config.write_text(f'[marketplaces.pstack-claude]\nsource = "{plugin["source"]}"\nref = "{plugin["ref"]}"\n')
                    return subprocess.CompletedProcess(command, 0, json.dumps({"installedRoot": str(home / "source")}))
                return subprocess.CompletedProcess(command, 0, plugin["ref"] + "\n")
            with patch.object(installer.subprocess, "run", side_effect=run):
                installer.register_marketplace(plugin, "codex", home, {"CODEX_HOME": str(home)})
            self.assertEqual(calls[0], ["codex", "plugin", "marketplace", "remove", "pstack-claude", "--json"])
            self.assertEqual(calls[1], ["codex", "plugin", "marketplace", "add", plugin["source"], "--ref", plugin["ref"], "--json"])
            self.assertEqual(calls[2], ["git", "-C", str(home / "source"), "rev-parse", "HEAD"])

    def test_failed_marketplace_add_restores_the_previous_registration(self):
        plugin = self.lock["plugins"][0]
        with TemporaryDirectory() as directory:
            home = Path(directory)
            (home / "config.toml").write_text(f'[marketplaces.pstack-claude]\nsource = "{plugin["source"]}"\nref = "old"\n')
            failure = subprocess.CalledProcessError(1, "add")
            with patch.object(installer.subprocess, "run", side_effect=[None, failure, None]) as run:
                with self.assertRaises(subprocess.CalledProcessError):
                    installer.register_marketplace(plugin, "codex", home, {})
            self.assertEqual(run.call_args_list[-1].args[0],
                ["codex", "plugin", "marketplace", "add", plugin["source"], "--ref", "old", "--json"])

    def test_failed_marketplace_add_restores_previous_source_without_ref_and_reraises_original(self):
        plugin = self.lock["plugins"][0]
        previous_source = "https://fixtures.test/previous-marketplace.git"
        with TemporaryDirectory() as directory:
            home = Path(directory)
            (home / "config.toml").write_text(
                f'[marketplaces.{plugin["marketplace"]}]\nsource = "{previous_source}"\n')
            environment = {"CODEX_HOME": str(home)}
            failure = subprocess.CalledProcessError(1, "add", output="original add failure")
            with patch.object(installer.subprocess, "run", side_effect=[None, failure, None]) as run:
                with self.assertRaises(subprocess.CalledProcessError) as raised:
                    installer.register_marketplace(plugin, "codex", home, environment)
            self.assertIs(raised.exception, failure)
            self.assertEqual([call.args[0] for call in run.call_args_list], [
                ["codex", "plugin", "marketplace", "remove", plugin["marketplace"], "--json"],
                ["codex", "plugin", "marketplace", "add", plugin["source"], "--ref", plugin["ref"], "--json"],
                ["codex", "plugin", "marketplace", "add", previous_source, "--json"],
            ])
            self.assertEqual(run.call_args_list[-1].kwargs, {"check": True, "env": environment, "capture_output": True})

    def test_same_version_plugin_cache_content_must_match_the_selected_source(self):
        with TemporaryDirectory() as directory:
            home = Path(directory)
            plugin = copy.deepcopy(self.lock["plugins"][0])
            root = home / "plugins/cache" / plugin["marketplace"] / plugin["name"] / plugin["version"]
            (root / ".codex-plugin").mkdir(parents=True)
            data = json.dumps({"name": plugin["name"], "version": plugin["version"]}).encode()
            (root / ".codex-plugin/plugin.json").write_bytes(data)
            (root / "skill.txt").write_bytes(b"current")
            plugin["content_sha256"] = installer.content_digest({".codex-plugin/plugin.json": installer.blob_digest(data),
                                                               "skill.txt": installer.blob_digest(b"current")})
            with patch.object(installer, "register_marketplace"), patch.object(installer.subprocess, "run"):
                installer.install_plugins([plugin], "codex", home)
                (root / "skill.txt").write_bytes(b"stale same-version cache")
                with self.assertRaisesRegex(installer.HarnessError, "source content"):
                    installer.install_plugins([plugin], "codex", home)

    def test_persistent_lock_precedence_and_old_local_adoption_preview_are_read_only(self):
        for mode in ("seed", "persistent", "adopt"):
            with self.subTest(mode=mode), TemporaryDirectory() as directory:
                payload = self.make_repo(Path(directory) / "payload")
                old_repo = self.make_repo(Path(directory) / "old repo")
                state = old_repo / ".local" if mode == "adopt" else Path(directory) / "state"
                selected = copy.deepcopy(self.lock)
                selected["codegraph"]["version"] = "99.0.0"
                selected_path = (old_repo / "sources/dependencies.lock.json" if mode == "adopt"
                                 else state / "sources/dependencies.lock.json")
                if mode != "seed":
                    selected_path.parent.mkdir(parents=True, exist_ok=True)
                    selected_path.write_text(json.dumps(selected))
                before = {p: p.read_bytes() for p in Path(directory).rglob("*") if p.is_file()}
                with patch.object(installer, "resolve", wraps=installer.resolve) as resolve, \
                        patch.object(installer, "fetch", side_effect=AssertionError("locked preview network")):
                    self.assertEqual(self.run_main(payload, "--locked", "--state-root", str(state)), 0)
                expected = self.lock if mode == "seed" else selected
                self.assertEqual(resolve.call_args.args[0], expected)
                self.assertEqual(before, {p: p.read_bytes() for p in Path(directory).rglob("*") if p.is_file()})
                if mode != "persistent":
                    self.assertFalse(state.exists())

    def test_persistent_install_writes_only_state_and_keeps_lock_on_each_failure(self):
        result = self.resolve()
        operations = ("install_agent", "install_codegraph", "install_plugins", "sync_sources", "save_paths")
        for failing in (*operations, None):
            with self.subTest(failing=failing), TemporaryDirectory() as directory:
                payload = self.make_repo(Path(directory) / "payload")
                state = Path(directory) / "state [cache] 한글"
                lock_path = state / "sources/dependencies.lock.json"
                lock_path.parent.mkdir(parents=True)
                old = json.dumps(self.lock).encode()
                lock_path.write_bytes(old)
                stale = state / "skills/agent-desktop/stale.txt"
                stale.parent.mkdir(parents=True)
                stale.write_bytes(b"old source")
                before = {p: p.read_bytes() for p in payload.rglob("*") if p.is_file()}
                real_write = installer.atomic_write

                def write(path, data):
                    self.assertTrue(path.is_relative_to(state), path)
                    real_write(path, data)

                with ExitStack() as stack:
                    stack.enter_context(patch.object(installer, "resolve", return_value=result))
                    stack.enter_context(patch.object(installer.platform, "machine", return_value="AMD64"))
                    stack.enter_context(patch.object(installer.shutil, "which", return_value="fixture"))
                    stack.enter_context(patch.object(installer, "atomic_write", side_effect=write))
                    for name in operations:
                        original = getattr(installer, name)

                        def operation(*args, name=name, original=original):
                            self.assertEqual(lock_path.read_bytes(), old)
                            if name == failing:
                                raise installer.HarnessError("fixture failure")
                            if name in ("sync_sources", "save_paths"):
                                return original(*args)
                            if name in ("install_agent", "install_codegraph"):
                                self.assertEqual(args[1], state)
                                return state / "tools" / name

                        stack.enter_context(patch.object(installer, name, side_effect=operation))
                    self.assertEqual(self.run_main(payload, "--install", "--state-root", str(state)),
                                     2 if failing else 0)
                self.assertEqual(before, {p: p.read_bytes() for p in payload.rglob("*") if p.is_file()})
                if failing:
                    self.assertEqual(lock_path.read_bytes(), old)
                else:
                    self.assertEqual(json.loads(lock_path.read_bytes()), result.lock)
                    self.assertEqual(next((state / "source-backups").rglob("stale.txt")).read_bytes(), b"old source")
                    for path, data in result.files.items():
                        self.assertEqual((state / path).read_bytes(), data)
                    self.assertIn(state.as_posix(), (state / "homelab-desktop.toml").read_text(encoding="utf-8"))

    def test_adopted_local_survives_new_payload_seed_without_writing_old_repository(self):
        result = self.resolve()
        with TemporaryDirectory() as directory:
            old_repo = self.make_repo(Path(directory) / "old repo")
            state = old_repo / ".local"
            first = self.make_repo(Path(directory) / "release one")
            second = self.make_repo(Path(directory) / "release two")
            new_seed = copy.deepcopy(self.lock)
            new_seed["codegraph"]["version"] = "99.0.0"
            (second / "sources/dependencies.lock.json").write_text(json.dumps(new_seed))
            before = {p: p.read_bytes() for root in (old_repo, first, second)
                      for p in root.rglob("*") if p.is_file()}
            with patch.object(installer.platform, "machine", return_value="AMD64"), \
                    patch.object(installer.shutil, "which", return_value="fixture"), \
                    patch.object(installer, "install_agent", return_value=state / "tools/agent.exe"), \
                    patch.object(installer, "install_codegraph", return_value=state / "tools/graph.cmd"), \
                    patch.object(installer, "install_plugins"), \
                    patch.object(installer, "resolve", return_value=result) as resolve:
                self.assertEqual(self.run_main(first, "--install", "--state-root", str(state)), 0)
                self.assertEqual(resolve.call_args.args[0], self.lock)
            saved = (state / "sources/dependencies.lock.json").read_bytes()
            with patch.object(installer, "resolve", wraps=installer.resolve) as resolve, \
                    patch.object(installer, "fetch", side_effect=AssertionError("locked preview network")):
                self.assertEqual(self.run_main(second, "--locked", "--state-root", str(state)), 0)
                self.assertEqual(resolve.call_args.args[0], result.lock)
            self.assertEqual((state / "sources/dependencies.lock.json").read_bytes(), saved)
            for path, data in before.items():
                self.assertEqual(path.read_bytes(), data)
            for root in (first, second):
                self.assertFalse((root / ".local").exists())
            self.assertEqual({p: p.read_bytes() for p in old_repo.rglob("*")
                              if p.is_file() and not p.is_relative_to(state)},
                             {p: data for p, data in before.items() if p.is_relative_to(old_repo)})

    def test_source_state_overlap_is_rejected_before_dependency_resolution(self):
        with TemporaryDirectory() as directory:
            repo = self.make_repo(directory)
            before = {p.relative_to(repo): p.read_bytes() for p in repo.rglob("*") if p.is_file()}
            for state in (repo, repo / "skills", repo / "sources", repo / "common", repo.parent):
                with self.subTest(state=state), patch.object(installer, "resolve") as resolve:
                    self.assertEqual(self.run_main(repo, "--install", "--state-root", str(state)), 2)
                    resolve.assert_not_called()
                    self.assertEqual({p.relative_to(repo): p.read_bytes() for p in repo.rglob("*") if p.is_file()}, before)

    def test_locked_state_cache_reuses_verified_bytes_without_network(self):
        result = self.resolve()
        with TemporaryDirectory() as directory:
            state = Path(directory)
            installer.sync_sources(result, state, state / "source-backups")
            result.files.clear()
            with patch.object(installer, "fetch", side_effect=AssertionError("verified cache downloads")):
                installer.sync_sources(result, state, state / "source-backups")
            (state / "skills/agent-desktop/SKILL.md").write_bytes(b"corrupt cache")
            with patch.object(installer, "fetch", return_value=b"wrong source"):
                with self.assertRaisesRegex(installer.HarnessError, "digest mismatch"):
                    installer.sync_sources(result, state, state / "source-backups")

    def make_plugin_cache(self, home, content=b"official\n"):
        plugin = copy.deepcopy(self.lock["plugins"][1])
        root = home / "plugins/cache" / plugin["marketplace"] / plugin["name"] / plugin["version"]
        (root / ".codex-plugin").mkdir(parents=True)
        manifest = json.dumps({"name": plugin["name"], "version": plugin["version"]}).encode()
        (root / ".codex-plugin/plugin.json").write_bytes(manifest)
        (root / "skill.txt").write_bytes(content)
        plugin["content_sha256"] = installer.content_digest({
            ".codex-plugin/plugin.json": installer.blob_digest(manifest),
            "skill.txt": installer.blob_digest(b"official\n"),
        })
        return plugin, root

    def test_plugin_git_overrides_append_without_mutating_inherited_environment(self):
        for count in (0, 2, 3):
            with self.subTest(count=count), TemporaryDirectory() as directory:
                home = Path(directory)
                plugin, _ = self.make_plugin_cache(home)
                inherited = {"GIT_CONFIG_COUNT": str(count)}
                if count:
                    inherited.update(GIT_CONFIG_KEY_0="core.autocrlf", GIT_CONFIG_VALUE_0="true",
                                     GIT_CONFIG_KEY_1="core.eol", GIT_CONFIG_VALUE_1="crlf")
                if count == 3:
                    inherited.update(GIT_CONFIG_KEY_2="core.longpaths", GIT_CONFIG_VALUE_2="false")
                with patch.dict(installer.os.environ, inherited), \
                        patch.object(installer, "register_marketplace") as register, \
                        patch.object(installer.subprocess, "run") as run:
                    before = dict(installer.os.environ)
                    installer.install_plugins([plugin], "codex", home)
                    environment = run.call_args.kwargs["env"]
                    self.assertEqual(environment["GIT_CONFIG_COUNT"], str(count + 3))
                    for index, (key, value) in enumerate((("core.autocrlf", "false"), ("core.eol", "lf"),
                                                         ("core.longpaths", "true")), count):
                        self.assertEqual(environment[f"GIT_CONFIG_KEY_{index}"], key)
                        self.assertEqual(environment[f"GIT_CONFIG_VALUE_{index}"], value)
                    for index in range(count):
                        for field in ("KEY", "VALUE"):
                            key = f"GIT_CONFIG_{field}_{index}"
                            self.assertEqual(environment[key], before[key])
                    self.assertEqual(environment["CODEX_HOME"], str(home))
                    self.assertEqual(register.call_args.args[-1], environment)
                    self.assertEqual(dict(installer.os.environ), before)

    def test_same_ref_marketplace_refreshes_only_missing_or_changed_cache(self):
        for state in ("crlf", "missing", "exact"):
            with self.subTest(state=state), TemporaryDirectory() as directory:
                home = Path(directory)
                plugin, root = self.make_plugin_cache(home, b"official\r\n" if state == "crlf" else b"official\n")
                if state == "missing":
                    installer.shutil.rmtree(root)
                config = home / "config.toml"
                registration = f'[marketplaces.{plugin["marketplace"]}]\nsource = "{plugin["source"]}"\nref = "{plugin["ref"]}"\n'
                config.write_text(registration)
                calls = []

                def run(command, **kwargs):
                    calls.append(command)
                    if command[1:4] == ["plugin", "marketplace", "remove"]:
                        config.write_text("")
                        if root.exists():
                            installer.shutil.rmtree(root)
                    elif command[1:4] == ["plugin", "marketplace", "add"]:
                        if not config.read_text():
                            self.make_plugin_cache(home)
                        config.write_text(registration)
                        return subprocess.CompletedProcess(command, 0, json.dumps({"installedRoot": str(home / "source")}))
                    return subprocess.CompletedProcess(command, 0, plugin["ref"] + "\n")

                with patch.object(installer.subprocess, "run", side_effect=run):
                    installer.install_plugins([plugin], "codex", home)
                self.assertEqual((root / "skill.txt").read_bytes(), b"official\n")
                removals = [command for command in calls if command[1:4] == ["plugin", "marketplace", "remove"]]
                self.assertEqual(len(removals), 0 if state == "exact" else 1)
                if removals:
                    self.assertEqual(calls[0], removals[0])
                self.assertFalse(any(command[1:3] == ["plugin", "remove"] for command in calls))

    def test_failed_cache_repair_keeps_old_lock_and_rejects_changed_bytes(self):
        with TemporaryDirectory() as directory:
            repo = self.make_repo(directory)
            home = repo / "fake home"
            plugin, _ = self.make_plugin_cache(home, b"official\r\n")
            config = home / "config.toml"
            config.write_text(f'[marketplaces.{plugin["marketplace"]}]\nsource = "{plugin["source"]}"\nref = "{plugin["ref"]}"\n')
            result = installer.Resolution(copy.deepcopy(self.lock))
            result.lock["plugins"] = [plugin]
            old = (repo / "sources/dependencies.lock.json").read_bytes()

            def run(command, **kwargs):
                if command[1:4] == ["plugin", "marketplace", "add"]:
                    return subprocess.CompletedProcess(command, 0, json.dumps({"installedRoot": str(home / "source")}))
                return subprocess.CompletedProcess(command, 0, plugin["ref"] + "\n")

            with patch.object(installer, "resolve", return_value=result), \
                    patch.object(installer.platform, "machine", return_value="AMD64"), \
                    patch.object(installer.shutil, "which", return_value="tool"), \
                    patch.object(installer, "install_agent"), patch.object(installer, "install_codegraph"), \
                    patch.object(installer.subprocess, "run", side_effect=run) as execute, \
                    patch.object(installer, "sync_sources") as sync, patch.object(installer, "save_paths") as save:
                self.assertEqual(self.run_main(repo, "--install"), 2)
                sync.assert_not_called()
                save.assert_not_called()
            self.assertEqual((repo / "sources/dependencies.lock.json").read_bytes(), old)
            self.assertEqual(execute.call_args_list[0].args[0],
                             ["codex", "plugin", "marketplace", "remove", plugin["marketplace"], "--json"])

    def test_shared_marketplace_refreshes_once_preserves_other_selections_and_verifies_all_caches(self):
        with TemporaryDirectory() as directory:
            home = Path(directory)
            first, first_root = self.make_plugin_cache(home)
            second = {**first, "name": "sibling", "manifest": "plugins/sibling/plugin.json"}
            second_root = first_root.parent.parent / second["name"] / second["version"]
            second_root.mkdir(parents=True)
            data = json.dumps({"name": second["name"], "version": second["version"]}).encode()
            (second_root / "plugin.json").write_bytes(data)
            second["content_sha256"] = installer.content_digest({"plugin.json": installer.blob_digest(data)})
            (second_root / "plugin.json").write_bytes(b"corrupt sibling cache")
            config = home / "config.toml"
            unrelated = f"unrelated@{first['marketplace']}"
            settings = {"enabled": False, "private_token": "credential-sentinel"}
            original = {"marketplaces": {first["marketplace"]: {"source": first["source"], "ref": first["ref"]}},
                        "plugins": {unrelated: settings}, "mcp_servers": {"local": {"url": "http://127.0.0.1/private"}}}
            config.write_text(tomlkit.dumps(original), encoding="utf-8")
            calls = []

            def run(command, **kwargs):
                calls.append(command)
                current = tomlkit.parse(config.read_text(encoding="utf-8"))
                if command[1:4] == ["plugin", "marketplace", "remove"]:
                    current.pop("marketplaces")
                    current.pop("plugins")
                    config.write_text(tomlkit.dumps(current), encoding="utf-8")
                elif command[1:4] == ["plugin", "marketplace", "add"]:
                    current["marketplaces"] = original["marketplaces"]
                    config.write_text(tomlkit.dumps(current), encoding="utf-8")
                    return subprocess.CompletedProcess(command, 0, json.dumps({"installedRoot": str(home / "source")}))
                elif command[1:4] == ["plugin", "add", "sibling@egm"]:
                    (second_root / "plugin.json").write_bytes(data)
                return subprocess.CompletedProcess(command, 0, first["ref"] + "\n")

            with patch.object(installer.subprocess, "run", side_effect=run):
                installer.install_plugins([first, second], "codex", home)
            self.assertEqual(len([call for call in calls if call[1:4] == ["plugin", "marketplace", "remove"]]), 1)
            self.assertEqual(len([call for call in calls if call[1:4] == ["plugin", "marketplace", "add"]]), 1)
            self.assertIn(["codex", "plugin", "add", unrelated, "--json"], calls)
            final = tomlkit.parse(config.read_text(encoding="utf-8"))
            self.assertEqual(final["plugins"][unrelated], settings)
            self.assertEqual(final["mcp_servers"], original["mcp_servers"])
            self.assertEqual(installer.plugin_cache_digest(second, home), second["content_sha256"])
            (first_root / "skill.txt").write_bytes(b"changed after refresh")
            with patch.object(installer, "register_marketplace"), patch.object(installer.subprocess, "run"):
                with self.assertRaisesRegex(installer.HarnessError, "source content"):
                    installer.install_plugins([first, second], "codex", home)

    def test_shared_marketplace_resolves_one_selection_and_ref(self):
        with TemporaryDirectory() as directory:
            desired = self.desired(directory, plugins=[{"name": name, "marketplace": "shared",
                "source": "https://github.com/example/shared.git", "channel": "latest-release",
                "manifest": f"plugins/{name}/plugin.json"} for name in ("one", "two")])
            manifests = {f"plugins/{name}/plugin.json": json.dumps({"name": name, "version": "1.0.0"}).encode()
                         for name in ("one", "two")}
            tree = [{"path": path, "type": "blob", "mode": "100644", "sha": installer.blob_digest(data)}
                    for path, data in manifests.items()]
            with patch.object(installer, "release", return_value=({"tag_name": "v1.0.0"}, self.commit)) as release, \
                    patch.object(installer, "source_tree", return_value=tree) as source_tree, \
                    patch.object(installer, "fetch", side_effect=lambda url: next(data for path, data in manifests.items() if url.endswith(path))):
                records = installer.resolve_plugins(desired.plugins)
            release.assert_called_once_with("example/shared")
            source_tree.assert_called_once_with("example/shared", self.commit)
            self.assertEqual({record["ref"] for record in records}, {self.commit})

    def test_incoherent_shared_marketplace_lock_fails_before_subprocess(self):
        first = self.lock["plugins"][0]
        second = {**first, "name": "second", "ref": "f" * 40}
        with TemporaryDirectory() as directory, patch.object(installer.subprocess, "run") as run:
            with self.assertRaisesRegex(installer.HarnessError, "Incoherent"):
                installer.install_plugins([first, second], "codex", Path(directory))
            run.assert_not_called()

    def test_mcp_installation_uses_selected_state_guard_and_keeps_old_lock_on_failure(self):
        with TemporaryDirectory() as directory:
            repo = self.make_repo(Path(directory) / "repo")
            state = Path(directory) / "state & 한글"
            result = self.resolve()
            result.lock["mcp"] = [{"name": "fixture", "kind": "npm", "recipe": {"version": "1.0.0"}}]
            original = (repo / "sources/dependencies.lock.json").read_bytes()
            with patch.object(installer, "resolve", return_value=result), \
                    patch.object(installer.platform, "machine", return_value="AMD64"), \
                    patch.object(installer.shutil, "which", return_value="fixture"), \
                    patch.object(installer, "install_agent", return_value=state / "agent.exe"), \
                    patch.object(installer, "install_codegraph", return_value=state / "graph.cmd"), \
                    patch.object(installer, "install_plugins"), \
                    patch.object(installer.mcp_packages, "preflight", create=True) as preflight, \
                    patch.object(installer.mcp_packages, "configuration") as configuration, \
                    patch.object(installer.mcp_packages, "install", side_effect=ValueError("fixture package failure")) as install, \
                    patch.object(installer, "sync_sources") as sync, patch.object(installer, "save_paths") as save:
                self.assertEqual(self.run_main(repo, "--install", "--state-root", str(state)), 2)
            install.assert_called_once_with(result.lock["mcp"][0], state, guard=installer.safe_file)
            preflight.assert_called_once_with(result.lock["mcp"][0])
            configuration.assert_not_called()
            sync.assert_not_called()
            save.assert_not_called()
            self.assertEqual((repo / "sources/dependencies.lock.json").read_bytes(), original)
            self.assertFalse((state / "sources/dependencies.lock.json").exists())

    def test_mcp_recipe_preflight_failure_precedes_all_install_side_effects(self):
        with TemporaryDirectory() as directory:
            repo = self.make_repo(directory)
            result = installer.Resolution(copy.deepcopy(self.lock))
            result.lock["mcp"] = [{"name": "fixture", "kind": "python"}]
            original = (repo / "sources/dependencies.lock.json").read_bytes()
            with patch.object(installer, "resolve", return_value=result), \
                    patch.object(installer.mcp_packages, "preflight", create=True,
                                 side_effect=ValueError("Invalid package context")) as preflight, \
                    patch.object(installer, "install_agent") as agent, patch.object(installer, "install_codegraph") as graph, \
                    patch.object(installer, "install_plugins") as plugins, patch.object(installer.mcp_packages, "install") as mcp:
                self.assertEqual(self.run_main(repo, "--install", "--locked"), 2)
            preflight.assert_called_once_with(result.lock["mcp"][0])
            for operation in (agent, graph, plugins, mcp):
                operation.assert_not_called()
            self.assertEqual((repo / "sources/dependencies.lock.json").read_bytes(), original)

    def test_malformed_npm_recipe_fails_preflight_before_installation_or_writes(self):
        with TemporaryDirectory() as directory:
            repo = self.make_repo(directory)
            desired = self.desired(repo, mcp=[{"name": "fixture", "kind": "npm", "package": "example",
                                               "entrypoint": "example"}])
            declaration = desired.mcp[0]
            record = {"name": declaration["name"], "kind": "npm", "declaration": declaration,
                      "declaration_sha256": declaration_hash(declaration),
                      "recipe": {"version": "1.0.0", "bin": "node_modules/example/cli.js",
                                 "package_lock": {"lockfileVersion": 3, "packages": {}}}}
            result = installer.Resolution(copy.deepcopy(self.lock))
            result.lock["mcp"] = [record]
            before = {p.relative_to(repo): p.read_bytes() for p in repo.rglob("*") if p.is_file()}
            with self.assertRaises(ValueError):
                installer.mcp_packages.configuration(record, repo)
            preflight = installer.mcp_packages.preflight
            with ExitStack() as stack:
                stack.enter_context(patch.object(installer, "resolve", return_value=result))
                validate = stack.enter_context(patch.object(installer.mcp_packages, "preflight",
                                                           side_effect=preflight))
                stack.enter_context(patch.object(installer, "fetch", side_effect=AssertionError("network")))
                operations = [stack.enter_context(patch.object(installer, name)) for name in (
                    "install_agent", "install_codegraph", "install_plugins", "sync_sources", "save_paths", "atomic_write")]
                operations.append(stack.enter_context(patch.object(installer.mcp_packages, "install")))
                self.assertEqual(self.run_main(repo, "--install", "--locked"), 2)
            validate.assert_called_once_with(record)
            for operation in operations:
                operation.assert_not_called()
            self.assertEqual({p.relative_to(repo): p.read_bytes() for p in repo.rglob("*") if p.is_file()}, before)
            self.assertFalse((repo / "fake home").exists())
            self.assertFalse((repo / ".local").exists())

    def test_failed_commands_do_not_print_auth_values(self):
        with TemporaryDirectory() as directory:
            repo = self.make_repo(directory)
            secret = "credential-sentinel"
            output = io.StringIO()
            failure = subprocess.CalledProcessError(1, ["tool", f"https://user:{secret}@example.test"], stderr=secret)
            with patch.object(installer, "REPO", repo), patch.object(installer, "resolve", side_effect=failure), \
                    redirect_stdout(io.StringIO()), redirect_stderr(output):
                self.assertEqual(installer.main(["--host", "homelab-desktop", "--codex-home", str(repo / "home")]), 2)
            self.assertNotIn(secret, output.getvalue())
            self.assertIn("Dependency operation failed", output.getvalue())


if __name__ == "__main__":
    unittest.main()
