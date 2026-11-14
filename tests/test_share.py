import base64
from contextlib import redirect_stderr, redirect_stdout
import io
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import tomlkit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import share
from registry import declaration_hash, normalize_mcp


class ShareTests(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.home = self.root / "user"
        self.codex = self.root / "separate-codex"
        self.state = self.root / "state"
        self.codex.mkdir()
        self.secret = "PRIVATE-sentinel-abc123"
        self.remote_text = '# keep this comment\nschema_version = 1\n'
        self.remote_sha = "a" * 40
        self.commit_url = f"https://github.com/tttaliesin/personal-harness/commit/{'b' * 40}"
        self.config = {"mcp_servers": {"remote": {"url": "https://share-fixture.example.invalid/mcp",
            "http_headers": {"Authorization": self.secret}}}}
        self.write_config()

    def write_config(self):
        (self.codex / "config.toml").write_text(tomlkit.dumps(self.config), encoding="utf-8")

    def write_lock(self, lock):
        path = self.state / "sources/dependencies.lock.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(lock), encoding="utf-8")

    def npm(self, package="@example/server", bins=None, version="1.2.3", root=None):
        root = root or self.home / "AppData/Local/npm-cache/_npx/fixture"
        path = root / "node_modules" / package / "package.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"name": package, "version": version,
            "bin": bins or {"server": "bin/start.js"}}), encoding="utf-8")
        (root / "package-lock.json").write_text(json.dumps({"packages": {f"node_modules/{package}": {
            "version": version, "resolved": f"https://registry.npmjs.org/{package}/-/server-{version}.tgz",
            "integrity": "sha512-public-fixture"}}}), encoding="utf-8")
        return path

    def plugin(self, *, managed=True, prefix="plugins/example", entry_source=None):
        spec = {"name": "example", "marketplace": "example-market", "source": "https://github.com/example/plugins.git",
            "channel": "git-ref", "ref": "c" * 40, "manifest": f"{prefix}/.codex-plugin/plugin.json" if prefix else ".codex-plugin/plugin.json",
            "enabled": True}
        self.config["plugins"] = {"example@example-market": {"enabled": True}}
        self.config["marketplaces"] = {"example-market": {"source_type": "git", "source": spec["source"], "ref": spec["ref"]}}
        root = self.codex / "plugins/cache/example-market/example/1.0.0"
        manifest = root / ".codex-plugin/plugin.json"
        manifest.parent.mkdir(parents=True, exist_ok=True)
        manifest.write_text(json.dumps({"name": "example", "version": "1.0.0", "args": [self.secret]}), encoding="utf-8")
        if managed:
            self.write_lock({"plugins": [{**spec, "version": "1.0.0"}]})
        else:
            marketplace = root / ".agents/plugins/marketplace.json"
            marketplace.parent.mkdir(parents=True, exist_ok=True)
            marketplace.write_text(json.dumps({"name": "example-market", "plugins": [{"name": "example",
                "source": entry_source if entry_source is not None else "./" + prefix}]}), encoding="utf-8")
        self.write_config()
        return spec

    def discover(self):
        self.write_config()
        return share.discover(self.codex, self.state, self.home)

    def github(self, endpoint, *, payload=None):
        if payload is not None:
            self.uploads.append((endpoint, payload))
            return {"commit": {"html_url": self.commit_url}}
        if endpoint == share.API:
            return {"permissions": {"push": True}}
        return {"sha": self.remote_sha, "encoding": "base64",
                "content": base64.b64encode(self.remote_text.encode()).decode()}

    def run_main(self, options=(), *, answers=(), tty=False):
        self.uploads = []
        output, errors = io.StringIO(), io.StringIO()
        with patch.object(share, "gh_api", side_effect=self.github) as api, patch.object(
                share, "verify_public_plugins") as public, patch.object(sys.stdin, "isatty", return_value=tty), patch(
                "builtins.input", side_effect=answers), redirect_stdout(output), redirect_stderr(errors):
            code = share.main(["--home", str(self.home), "--codex-home", str(self.codex), "--state-root", str(self.state), *options])
        self.assertNotIn(self.secret, output.getvalue() + errors.getvalue() + repr(self.uploads))
        return code, output.getvalue(), errors.getvalue(), api, public

    def test_actual_cli_list_is_local_only_and_never_echoes_private_values(self):
        self.config["mcp_servers"].update({"private": {"url": f"https://example.com/mcp?{self.secret}"},
            "node_repl": {"command": self.secret, "args": [self.secret]},
            "wrapper": {"command": str(self.root / self.secret), "args": [self.secret], "cwd": self.secret}})
        self.write_config()
        environment = {**os.environ, "GH_DEBUG": self.secret}
        completed = subprocess.run([sys.executable, str(Path(share.__file__)), "--codex-home", str(self.codex),
            "--state-root", str(self.state), "--list"], capture_output=True, text=True, env=environment)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn("mcp:remote: Ready", completed.stdout)
        self.assertIn("mcp:private: Blocked", completed.stdout)
        self.assertNotIn(self.secret, completed.stdout + completed.stderr)
        code, _, _, api, public = self.run_main(["--list"])
        self.assertEqual(code, 0)
        api.assert_not_called()
        public.assert_not_called()

    def test_actual_cli_unknown_options_do_not_echo_private_values(self):
        completed = subprocess.run([sys.executable, str(Path(share.__file__)), "--local-config", self.secret],
            capture_output=True, text=True)
        self.assertEqual(completed.returncode, 2)
        self.assertNotIn(self.secret, completed.stdout + completed.stderr)

    def test_npx_metadata_projection_and_separate_user_home(self):
        self.npm()
        self.config["mcp_servers"] = {"package": {"command": "npx", "args": ["-y", "@example/server@1.2.3",
            "--config", self.secret, "--opaque=" + self.secret], "cwd": self.secret,
            "env": {"SERVICE_TOKEN": self.secret}, "env_vars": ["Z_TOKEN"]}}
        candidate, = self.discover()
        self.assertIsInstance(candidate, share.Ready)
        self.assertEqual(candidate.declaration, normalize_mcp(dict(name="package", kind="npm", package="@example/server",
            version="1.2.3", entrypoint="server", env_vars=["SERVICE_TOKEN", "Z_TOKEN"])))
        self.assertTrue(candidate.local_settings)
        self.assertNotIn(self.secret, repr(candidate))
        self.run_main(["--select", "mcp:package", "--dry-run"])

    def test_npm_cache_override_and_direct_node_bin_identity(self):
        cache = self.root / "custom-cache"
        manifest = self.npm(root=cache / "_npx/cache")
        self.config["mcp_servers"] = {"package": {"command": "npx", "args": ["@example/server"]}}
        with patch.dict(os.environ, {"npm_config_cache": str(cache)}):
            self.assertIsInstance(self.discover()[0], share.Ready)
        self.config["mcp_servers"]["package"] = {"command": "node", "args": [str(manifest.parent / "bin/start.js"), self.secret]}
        self.assertEqual(self.discover()[0].declaration["entrypoint"], "server")
        self.config["mcp_servers"]["package"]["args"][0] = str(manifest.parent / "private.js")
        self.assertIsInstance(self.discover()[0], share.Blocked)

    def test_unpinned_npx_keeps_latest_policy_and_explicit_pin_is_preserved(self):
        self.npm()
        for requested, expected in (("@example/server", "latest"), ("@example/server@1.2.3", "1.2.3")):
            self.config["mcp_servers"] = {"package": {"command": "npx", "args": [requested]}}
            self.assertEqual(self.discover()[0].declaration["version"], expected)

    def test_private_registry_and_ambiguous_npx_bins_block(self):
        manifest = self.npm(bins={"first": "a.js", "second": "b.js"})
        self.config["mcp_servers"] = {"package": {"command": "npx", "args": ["@example/server"]}}
        self.assertIsInstance(self.discover()[0], share.Blocked)
        data = json.loads(manifest.read_text())
        data["bin"] = {"server": "a.js"}
        manifest.write_text(json.dumps(data))
        lock = manifest.parents[3] / "package-lock.json"
        lock.write_text(lock.read_text().replace("registry.npmjs.org", self.secret + ".private.invalid"))
        candidate = self.discover()[0]
        self.assertIsInstance(candidate, share.Blocked)
        self.assertNotIn(self.secret, repr(candidate))

    def test_uvx_from_and_standard_package_ignore_application_args(self):
        for args, package, entry in ((["--from", "example-package==1.2.3", "server", self.secret], "example-package", "server"),
                                     (["example-package", "--config", self.secret], "example-package", "example-package")):
            self.config["mcp_servers"] = {"python": {"command": "uvx", "args": args}}
            candidate, = self.discover()
            self.assertEqual((candidate.declaration["package"], candidate.declaration["entrypoint"]), (package, entry))
            self.assertEqual(candidate.declaration["args"], [])
            self.assertNotIn(self.secret, repr(candidate))
        for args in (["--from", "git+https://example.com/private", "server"], ["--index-url", self.secret, "server"]):
            self.config["mcp_servers"]["python"]["args"] = args
            self.assertIsInstance(self.discover()[0], share.Blocked)

    def test_plugin_lock_and_unmanaged_marketplace_prove_manifest_path(self):
        spec = self.plugin()
        candidate = next(c for c in self.discover() if c.id.startswith("plugin:"))
        self.assertEqual(candidate.declaration, spec)
        self.assertNotIn(self.secret, repr(candidate))
        (self.state / "sources/dependencies.lock.json").unlink()
        self.assertIsInstance(next(c for c in self.discover() if c.id.startswith("plugin:")), share.Blocked)

    def test_managed_latest_release_declaration_is_preserved_and_noop(self):
        record = self.plugin()
        declaration = {key: value for key, value in record.items() if key != "ref"}
        declaration["channel"] = "latest-release"
        self.write_lock({"plugins": [{**record, "version": "1.0.0", "declaration": declaration,
                                      "declaration_sha256": declaration_hash(declaration)}]})
        candidate = next(c for c in self.discover() if c.id.startswith("plugin:"))
        self.assertEqual(candidate.declaration, declaration)
        text = tomlkit.dumps({"schema_version": 1, "plugins": [declaration]})
        self.assertEqual(share.merge_registry(text, [candidate]), text)
        self.write_lock({"plugins": [{**record, "version": "1.0.0"}], "registrations": {"plugins": [declaration]}})
        self.assertEqual(next(c for c in self.discover() if c.id.startswith("plugin:")).declaration, declaration)

    def test_selected_package_requires_anonymous_public_identity_before_any_github_call(self):
        self.npm()
        self.config["mcp_servers"] = {"package": {"command": "npx", "args": ["@example/server"]}}
        candidate, = self.discover()
        response = io.BytesIO(json.dumps({"name": "@example/server", "version": "1.2.3"}).encode())
        with patch.object(share.urllib.request, "urlopen", return_value=response) as fetch:
            share.verify_public_plugins([candidate])
        self.assertEqual(fetch.call_args.args[0], "https://registry.npmjs.org/%40example%2Fserver/latest")
        with patch.object(share.urllib.request, "urlopen", side_effect=OSError(self.secret)), patch.object(
                share, "gh_api") as api, redirect_stderr(io.StringIO()) as errors:
            code = share.main(["--home", str(self.home), "--codex-home", str(self.codex), "--state-root", str(self.state),
                               "--select", "mcp:package", "--yes"])
        self.assertEqual(code, 1)
        api.assert_not_called()
        self.assertNotIn(self.secret, errors.getvalue())

    def test_unmanaged_marketplace_relative_root_and_repository_prefix(self):
        for prefix in ("plugins/example", ""):
            with self.subTest(prefix=prefix):
                root = self.codex / "plugins/cache/example-market/example/1.0.0"
                if root.exists():
                    (root / ".agents/plugins/marketplace.json").unlink()
                    (root / ".codex-plugin/plugin.json").unlink()
                spec = self.plugin(managed=False, prefix=prefix)
                self.assertEqual(next(c for c in self.discover() if c.id.startswith("plugin:")).declaration, spec)

    def test_managed_declarations_are_validated_and_tied_to_selected_name(self):
        spec = normalize_mcp({"name": "remote", "kind": "http", "url": self.config["mcp_servers"]["remote"]["url"]})
        self.write_lock({"mcp": [{"name": "remote", "kind": "http", "declaration": spec,
                                  "declaration_sha256": declaration_hash(spec)}]})
        self.assertEqual(self.discover()[0].declaration, spec)
        self.config["mcp_servers"]["remote"]["url"] = "https://example.com/private/" + self.secret
        self.assertIsInstance(self.discover()[0], share.Blocked)

    def test_http_never_exports_queries_credentials_or_opaque_paths(self):
        for url in (f"https://example.com/mcp?opaque={self.secret}", f"https://user:{self.secret}@example.com/mcp",
                    f"https://example.com/{self.secret}", "https://localhost/mcp", "https://10.0.0.1/mcp", "http://example.com/mcp"):
            self.config["mcp_servers"] = {"remote": {"url": url}}
            candidate, = self.discover()
            self.assertIsInstance(candidate, share.Blocked)
            self.assertNotIn(self.secret, repr(candidate))

    def test_selection_dry_run_branch_override_and_publish_json_projection(self):
        code, output, _, api, _ = self.run_main(["--select", "mcp:remote", "--dry-run", "--branch", "acceptance/fixture"])
        self.assertEqual(code, 0)
        self.assertIn("Dry run", output)
        self.assertIn("Per-PC local settings required", output)
        self.assertEqual(self.uploads, [])
        self.assertIn("ref=acceptance%2Ffixture", api.call_args_list[-1].args[0])
        code, output, _, _, _ = self.run_main(["--select", "mcp:remote", "--yes", "--branch", "acceptance/fixture"])
        self.assertEqual(code, 0)
        self.assertIn(self.commit_url, output)
        endpoint, payload = self.uploads[0]
        self.assertEqual(endpoint, f"{share.API}/contents/registry.toml")
        self.assertEqual((payload["sha"], payload["branch"]), (self.remote_sha, "acceptance/fixture"))
        self.assertIn("# keep this comment", base64.b64decode(payload["content"]).decode())

    def test_noop_keeps_original_text_and_does_not_put(self):
        spec = share.Ready("mcp:remote", normalize_mcp({"name": "remote", "kind": "http",
            "url": self.config["mcp_servers"]["remote"]["url"]}))
        self.remote_text = share.merge_registry(self.remote_text, [spec])
        code, output, _, _, _ = self.run_main(["--select", "mcp:remote", "--yes"])
        self.assertEqual(code, 0)
        self.assertIn("Unchanged", output)
        self.assertEqual(self.uploads, [])
        self.assertEqual(share.merge_registry(self.remote_text, [spec]), self.remote_text)

    def test_interactive_numbers_cancel_and_blocked_selection(self):
        code, _, _, api, _ = self.run_main(answers=[""], tty=True)
        self.assertEqual(code, 0)
        api.assert_not_called()
        code, output, _, _, _ = self.run_main(answers=["1", "n"], tty=True)
        self.assertEqual(code, 0)
        self.assertIn("Cancelled", output)
        self.assertEqual(self.uploads, [])
        code, _, _, _, _ = self.run_main(answers=["1", "y"], tty=True)
        self.assertEqual(code, 0)
        self.assertEqual(len(self.uploads), 1)
        self.config["mcp_servers"]["remote"]["url"] += "?" + self.secret
        self.write_config()
        code, _, _, api, _ = self.run_main(answers=["1"], tty=True)
        self.assertEqual(code, 1)
        api.assert_not_called()

    def test_selection_errors_are_fixed_and_no_default_selection(self):
        for options in (["--yes"], [], ["--select", self.secret], ["--select", "1"],
                        ["--select", "mcp:remote,mcp:remote"]):
            code, _, _, api, _ = self.run_main(options)
            self.assertEqual(code, 1)
            api.assert_not_called()

    def test_merge_preserves_unselected_comments_and_rejects_marketplace_conflicts(self):
        self.remote_text += '\n[[mcp]] # unrelated\nname = "old" # keep name\nkind = "http"\nurl = "https://example.com/mcp"\n'
        spec = share.Ready("mcp:remote", normalize_mcp({"name": "remote", "kind": "http", "url": "https://example.com/sse"}))
        merged = share.merge_registry(self.remote_text, [spec])
        self.assertIn('name = "old" # keep name', merged)
        self.assertIn("# unrelated", merged)
        plugin = self.plugin()
        self.remote_text = tomlkit.dumps({"schema_version": 1, "plugins": [{**plugin, "name": "other", "ref": "d" * 40}]})
        with self.assertRaises(ValueError):
            share.merge_registry(self.remote_text, [share.Ready("plugin:example@example-market", plugin)])

    def test_gh_transport_suppresses_debug_and_uses_json_stdin(self):
        completed = subprocess.CompletedProcess([], 0, '{"ok": true}', "")
        with patch.dict(os.environ, {"GH_DEBUG": self.secret, "GH_HOST": self.secret, "GH_REPO": self.secret}), patch.object(
                share.subprocess, "run", return_value=completed) as run:
            self.assertEqual(share.gh_api(f"{share.API}/contents/registry.toml", payload={"sha": self.remote_sha}), {"ok": True})
        command = run.call_args.args[0]
        self.assertIn("github.com", command)
        self.assertEqual(command[-2:], ["--input", "-"])
        self.assertEqual(json.loads(run.call_args.kwargs["input"]), {"sha": self.remote_sha})
        self.assertNotIn("GH_DEBUG", run.call_args.kwargs["env"])

    def test_auth_denial_conflict_and_lost_write_response_are_not_retried(self):
        for status, message in ((403, "access denied"), (409, "conflicted"), (422, "conflicted")):
            completed = subprocess.CompletedProcess([], 1, "", f"HTTP {status} {self.secret}")
            with patch.object(share.subprocess, "run", return_value=completed) as run:
                with self.assertRaises(share.ShareError) as raised:
                    share.gh_api(f"{share.API}/contents/registry.toml", payload={"sha": self.remote_sha})
                self.assertIn(message, str(raised.exception))
                self.assertNotIn(self.secret, str(raised.exception))
                self.assertEqual(run.call_count, 1)
        with patch.object(share.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, self.secret, "")) as run:
            with self.assertRaisesRegex(share.ShareError, "lost or invalid"):
                share.gh_api(f"{share.API}/contents/registry.toml", payload={"sha": self.remote_sha})
            self.assertEqual(run.call_count, 1)


if __name__ == "__main__":
    unittest.main()
