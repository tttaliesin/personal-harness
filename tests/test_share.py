import base64
from contextlib import redirect_stderr, redirect_stdout
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
import urllib.error
import zipfile

import tomlkit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import share
from registry import declaration_hash, normalize_mcp, parse_registry


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
        self.owner_token = "ghp_dummy_owner_token"
        self.remote_text = '# keep this comment\nschema_version = 1\n'
        self.remote_sha = "a" * 40
        self.commit_url = f"https://github.com/tttaliesin/personal-harness/commit/{'b' * 40}"
        self.config = {"mcp_servers": {"remote": {"url": "https://share-fixture.example.invalid/mcp",
            "http_headers": {"Authorization": self.secret}}}}
        self.write_config()
        self.enterContext(patch.object(share.urllib.request, "urlopen", side_effect=AssertionError("Unexpected network")))

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

    def run_main(self, options=(), *, answers=(), tty=False, verify=False):
        self.uploads = []
        output, errors = io.StringIO(), io.StringIO()
        with patch.object(share, "ShareGitHub") as github, patch.object(
                share, "verify_public_plugins", **({"wraps": share.verify_public_plugins} if verify else {})) as public, patch.object(sys.stdin, "isatty", return_value=tty), patch(
                "builtins.input", side_effect=answers), redirect_stdout(output), redirect_stderr(errors):
            api = github.return_value.api
            api.side_effect = self.github
            code = share.main(["--home", str(self.home), "--codex-home", str(self.codex), "--state-root", str(self.state), *options])
        self.assertNotIn(self.secret, output.getvalue() + errors.getvalue() + repr(self.uploads))
        return code, output.getvalue(), errors.getvalue(), api, public

    def run_transport(self, options=("--select", "mcp:remote", "--yes"), *, environment=None,
                      credential=None, api_failure=None, answers=(), tty=False):
        config = self.root / "gh/hosts.yml"
        config.parent.mkdir(exist_ok=True)
        config.write_text("github.com:\n    user: suchang-busan\n", encoding="utf-8")
        before_config = hashlib.sha256(config.read_bytes()).hexdigest()
        before_local_config = (self.codex / "config.toml").read_bytes()
        output, errors = io.StringIO(), io.StringIO()
        self.uploads = []
        commands, inputs, api_environments = [], [], []

        def gh(command, **kwargs):
            commands.append(command)
            inputs.append(kwargs.get("input"))
            self.assertEqual(kwargs["env"]["PATH"], "fixture-path")
            self.assertEqual(kwargs["env"]["GH_CONFIG_DIR"], str(config.parent))
            self.assertIsNot(kwargs["env"], os.environ)
            for key in ("GH_DEBUG", "DEBUG", "GH_HOST", "GH_REPO", "GITHUB_TOKEN"):
                self.assertNotIn(key, kwargs["env"])
            self.assertTrue(kwargs["capture_output"])
            self.assertTrue(kwargs["text"])
            self.assertEqual(kwargs["encoding"], "utf-8")
            self.assertGreater(kwargs["timeout"], 0)
            self.assertLessEqual(kwargs["timeout"], 60)
            if command[:3] == ["gh", "auth", "token"]:
                self.assertEqual(command, ["gh", "auth", "token", "--hostname", "github.com", "--user", "tttaliesin"])
                self.assertNotIn("GH_TOKEN", kwargs["env"])
                if isinstance(credential, Exception):
                    raise credential
                return credential or subprocess.CompletedProcess(command, 0, self.owner_token + "\n", "")
            self.assertEqual(command[:2], ["gh", "api"])
            self.assertEqual(command[2:4], ["--hostname", "github.com"])
            api_environments.append(dict(kwargs["env"]))
            if api_failure and len(api_environments) == api_failure[0]:
                result = api_failure[1]
                if isinstance(result, Exception):
                    raise result
                return result
            if kwargs["env"].get("GH_TOKEN") not in {self.owner_token, "ghp_dummy_caller", "github_pat_dummy_caller"}:
                return subprocess.CompletedProcess(command, 1, "", "HTTP 403 access denied for active work account")
            payload = json.loads(kwargs["input"]) if kwargs.get("input") else None
            self.assertEqual(command[4:6], ["--method", "PUT" if payload else "GET"])
            response = self.github(command[6], payload=payload)
            return subprocess.CompletedProcess(command, 0, json.dumps(response), "")

        with patch.dict(os.environ, {"PATH": "fixture-path", "GH_CONFIG_DIR": str(config.parent),
                "USERPROFILE": str(self.home), "HOME": str(self.home), "GH_DEBUG": "api", "DEBUG": "1",
                "GH_HOST": "private.invalid", "GH_REPO": "work/private", **(environment or {})}, clear=True):
            before_environment = dict(os.environ)
            with patch.object(share.subprocess, "run", side_effect=gh), patch.object(
                    sys.stdin, "isatty", return_value=tty), patch("builtins.input", side_effect=answers), redirect_stdout(output), redirect_stderr(errors):
                code = share.main(["--home", str(self.home), "--codex-home", str(self.codex),
                    "--state-root", str(self.state), *options])
            self.assertEqual(dict(os.environ), before_environment)
        self.assertEqual(hashlib.sha256(config.read_bytes()).hexdigest(), before_config)
        self.assertEqual(list(config.parent.iterdir()), [config])
        self.assertEqual((self.codex / "config.toml").read_bytes(), before_local_config)
        visible = output.getvalue() + errors.getvalue() + repr(commands) + repr(inputs) + repr(self.uploads)
        visible += "".join(base64.b64decode(json.loads(value)["content"]).decode() for value in inputs if value)
        for token in (self.owner_token, "ghp_dummy_caller", "github_pat_dummy_caller", self.secret):
            self.assertNotIn(token, visible)
        return code, output.getvalue(), errors.getvalue(), commands, api_environments

    def test_main_uses_stored_owner_token_while_work_account_stays_active(self):
        code, output, errors, commands, environments = self.run_transport()
        self.assertEqual(code, 0, errors)
        self.assertIn(self.commit_url, output)
        self.assertEqual(len(self.uploads), 1)
        self.assertEqual(len(commands), 4)
        self.assertEqual([environment["GH_TOKEN"] for environment in environments], [self.owner_token] * 3)
        self.assertEqual([command[4:6] for command in commands[1:]], [["--method", "GET"], ["--method", "GET"], ["--method", "PUT"]])
        self.assertEqual([command[6] for command in commands[1:]], [share.API,
            f"{share.API}/contents/registry.toml?ref=main", f"{share.API}/contents/registry.toml"])
        self.assertEqual(self.uploads[0][1]["sha"], self.remote_sha)

    def test_explicit_token_precedence_and_empty_token_fallback(self):
        for environment, expected in (({"GH_TOKEN": "ghp_dummy_caller", "GITHUB_TOKEN": "github_pat_dummy_caller"}, "ghp_dummy_caller"),
                ({"GH_TOKEN": "ghp_dummy_caller", "GITHUB_TOKEN": "invalid lower priority token"}, "ghp_dummy_caller"),
                ({"GH_TOKEN": "ghp_dummy_caller"}, "ghp_dummy_caller"),
                ({"GITHUB_TOKEN": "github_pat_dummy_caller"}, "github_pat_dummy_caller"),
                ({"GH_TOKEN": "", "GITHUB_TOKEN": "github_pat_dummy_caller"}, "github_pat_dummy_caller"),
                ({"GH_TOKEN": "", "GITHUB_TOKEN": ""}, self.owner_token)):
            with self.subTest(environment=environment):
                code, _, errors, commands, environments = self.run_transport(environment=environment)
                self.assertEqual(code, 0, errors)
                self.assertEqual(len(commands), 4 if expected == self.owner_token else 3)
                self.assertEqual([entry["GH_TOKEN"] for entry in environments], [expected] * 3)

    def test_explicit_denial_never_falls_back_or_retries(self):
        for key in ("GH_TOKEN", "GITHUB_TOKEN"):
            for status in (401, 403):
                for request in (1, 2, 3):
                    with self.subTest(key=key, status=status, request=request):
                        failure = subprocess.CompletedProcess([], 1, self.owner_token, f"HTTP {status} ghp_dummy_caller")
                        code, _, errors, commands, environments = self.run_transport(
                            environment={key: "ghp_dummy_caller"}, api_failure=(request, failure))
                        self.assertEqual(code, 1)
                        self.assertIn("access denied", errors)
                        self.assertEqual(len(commands), request)
                        self.assertEqual([entry["GH_TOKEN"] for entry in environments], ["ghp_dummy_caller"] * request)
                        self.assertEqual(self.uploads, [])

    def test_stored_credential_failures_stop_before_api_without_leaks(self):
        failures = [subprocess.CompletedProcess([], 1, self.owner_token, self.secret)]
        failures += [subprocess.CompletedProcess([], 0, value, self.secret) for value in (
            "", "\n", " " + self.owner_token, self.owner_token + " ", self.owner_token + "\nextra",
            self.owner_token + "\n\n", "\x1b[31m" + self.owner_token, self.owner_token + "\x00")]
        failures += [OSError(self.owner_token), subprocess.TimeoutExpired(["gh", "auth", "token"], 20,
            output=self.owner_token, stderr=self.secret), UnicodeError(self.owner_token)]
        for failure in failures:
            with self.subTest(failure=type(failure).__name__):
                code, _, errors, commands, environments = self.run_transport(credential=failure)
                self.assertEqual(code, 1)
                self.assertEqual(errors, "GitHub authentication is unavailable or invalid for sharing.\n")
                self.assertEqual(len(commands), 1)
                self.assertEqual(environments, [])
                self.assertEqual(self.uploads, [])

    def test_malformed_explicit_token_does_not_use_other_credentials(self):
        for key in ("GH_TOKEN", "GITHUB_TOKEN"):
            for token in (" ", "ghp_dummy_caller\n", "ghp_dummy_caller\r", "ghp_dummy_caller\tother", "\x1b[31mghp_dummy_caller"):
                with self.subTest(key=key, token=token):
                    environment = {"GITHUB_TOKEN": "github_pat_dummy_caller", key: token}
                    code, _, errors, commands, _ = self.run_transport(environment=environment)
                    self.assertEqual(code, 1)
                    self.assertIn("authentication is unavailable or invalid", errors)
                    self.assertEqual(commands, [])
                    self.assertEqual(self.uploads, [])

    def test_local_list_cancel_and_invalid_selection_do_not_retrieve_credentials(self):
        for options, answers, tty, expected in ((["--list"], (), False, 0), ([], [""], True, 0),
                (["--select", "mcp:missing", "--yes"], (), False, 1), (["--yes"], (), False, 1)):
            with self.subTest(options=options):
                code, _, _, commands, _ = self.run_transport(options, answers=answers, tty=tty)
                self.assertEqual(code, expected)
                self.assertEqual(commands, [])

    def test_request_failure_never_retries_or_changes_default_auth(self):
        for request in (1, 2, 3):
            for failure in (OSError(self.owner_token), subprocess.TimeoutExpired(["gh", "api"], 60,
                    output=self.owner_token, stderr=self.secret), subprocess.CompletedProcess([], 1, self.owner_token, self.secret),
                    subprocess.CompletedProcess([], 0, self.owner_token, self.secret), UnicodeError(self.owner_token)):
                with self.subTest(request=request, failure=type(failure).__name__):
                    code, _, errors, commands, environments = self.run_transport(api_failure=(request, failure))
                    self.assertEqual(code, 1)
                    self.assertIn("Check the remote registry before trying again", errors)
                    self.assertEqual(len(commands), request + 1)
                    self.assertEqual([entry["GH_TOKEN"] for entry in environments], [self.owner_token] * request)
                    self.assertEqual(self.uploads, [])

    def test_permission_and_content_sha_validation_still_block_writes(self):
        for request, response, message in ((1, {"permissions": {"push": False}}, "write permission is required"),
                (2, {"sha": "invalid", "encoding": "base64", "content": ""}, "Invalid remote registry response")):
            with self.subTest(request=request):
                code, _, errors, commands, _ = self.run_transport(api_failure=(request,
                    subprocess.CompletedProcess([], 0, json.dumps(response), "")))
                self.assertEqual(code, 1)
                self.assertIn(message, errors)
                self.assertEqual(len(commands), request + 1)
                self.assertEqual(self.uploads, [])

    def test_api_keeps_one_private_environment_when_parent_changes(self):
        with patch.dict(os.environ, {"GH_TOKEN": "ghp_dummy_caller", "GITHUB_TOKEN": "github_pat_dummy_caller",
                "PATH": "original-path", "GH_CONFIG_DIR": "original-config"}, clear=True):
            github = share.ShareGitHub()
            with patch.dict(os.environ, {"GH_TOKEN": "changed_parent_token", "PATH": "changed-path",
                    "GH_CONFIG_DIR": "changed-config"}), patch.object(share.subprocess, "run",
                    return_value=subprocess.CompletedProcess([], 0, "{}", "")) as run:
                before = dict(os.environ)
                github.api(share.API)
                github.api(f"{share.API}/contents/registry.toml?ref=main")
                github.api(f"{share.API}/contents/registry.toml", payload={"sha": self.remote_sha})
                self.assertEqual(dict(os.environ), before)
            environments = [call.kwargs["env"] for call in run.call_args_list]
            self.assertEqual(len(environments), 3)
            for environment in environments:
                self.assertIs(environment, environments[0])
                self.assertIsNot(environment, os.environ)
                self.assertEqual(environment["GH_TOKEN"], "ghp_dummy_caller")
                self.assertEqual(environment["PATH"], "original-path")
                self.assertEqual(environment["GH_CONFIG_DIR"], "original-config")
                self.assertNotIn("GITHUB_TOKEN", environment)

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
        self.assertNotIsInstance(next(c for c in self.discover() if c.id.startswith("plugin:")), share.Ready)

    def test_selected_plugin_resolves_public_exact_ref_without_lock_or_cached_mapping(self):
        for native in (True, False):
            with self.subTest(native=native):
                spec = self.plugin()
                (self.state / "sources/dependencies.lock.json").unlink()
                candidate = next(c for c in self.discover() if c.id.startswith("plugin:"))
                self.assertNotIsInstance(candidate, share.Blocked)
                code, output, _, api, public = self.run_main(["--list"])
                self.assertEqual(code, 0)
                self.assertIn("Resolvable", output)
                api.assert_not_called()
                public.assert_not_called()
                marketplace = {"name": "example-market", "plugins": [{"name": "example", "source":
                    {"source": "local", "path": "./plugins/example"} if native else "./plugins/example"}]}
                responses = [io.BytesIO(json.dumps(marketplace).encode()),
                    io.BytesIO(b'{"private":false,"full_name":"example/plugins"}'), io.BytesIO(b'{"name":"example"}')]
                if not native:
                    responses.insert(0, urllib.error.HTTPError("https://raw.githubusercontent.com/fixture", 404, "missing", {}, None))
                with patch.object(share.urllib.request, "urlopen", side_effect=responses) as fetch:
                    code, output, _, _, _ = self.run_main(["--select", "plugin:example@example-market", "--yes"], verify=True)
                self.assertEqual(code, 0)
                root = "https://raw.githubusercontent.com/example/plugins/" + "c" * 40
                self.assertEqual(fetch.call_args_list[0].args[0], root + "/.agents/plugins/marketplace.json")
                if not native:
                    self.assertEqual(fetch.call_args_list[1].args[0], root + "/.claude-plugin/marketplace.json")
                self.assertEqual(fetch.call_args_list[-1].args[0], root + "/plugins/example/.codex-plugin/plugin.json")
                uploaded = parse_registry(base64.b64decode(self.uploads[0][1]["content"]).decode())
                self.assertEqual(uploaded.plugins, (spec,))

    def test_public_plugin_fallback_refuses_private_source_mapping_and_wrong_manifest(self):
        self.plugin()
        (self.state / "sources/dependencies.lock.json").unlink()
        for source in ({"source": "git", "path": "./plugins/example"}, "../private", "https://private.invalid/plugin", "./../private"):
            with self.subTest(source=source):
                marketplace = {"name": "example-market", "plugins": [{"name": "example", "source": source}]}
                with patch.object(share.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps(marketplace).encode())):
                    code, _, _, api, _ = self.run_main(["--select", "plugin:example@example-market", "--yes"], verify=True)
                self.assertEqual(code, 1)
                api.assert_not_called()
        with patch.object(share.urllib.request, "urlopen", side_effect=urllib.error.HTTPError(
                "https://raw.githubusercontent.com/fixture", 404, "missing", {}, None)) as fetch:
            code, _, _, api, _ = self.run_main(["--select", "plugin:example@example-market", "--yes"], verify=True)
        self.assertEqual(code, 1)
        self.assertEqual(fetch.call_count, 2)
        api.assert_not_called()
        marketplace = {"name": "example-market", "plugins": [{"name": "example", "source": "./plugins/example"}]}
        with patch.object(share.urllib.request, "urlopen", side_effect=[io.BytesIO(json.dumps(marketplace).encode()),
                io.BytesIO(b'{"private":false,"full_name":"example/plugins"}'), io.BytesIO(b'{"name":"wrong"}')]):
            code, _, _, api, _ = self.run_main(["--select", "plugin:example@example-market", "--yes"], verify=True)
        self.assertEqual(code, 1)
        api.assert_not_called()

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
        self.write_lock({"plugins": [{**record, "version": "1.0.0", "declaration": declaration,
                                      "declaration_sha256": "0" * 64}]})
        self.assertIsInstance(next(c for c in self.discover() if c.id.startswith("plugin:")), share.Blocked)

    def test_selected_package_requires_anonymous_public_identity_before_any_github_call(self):
        self.npm()
        self.config["mcp_servers"] = {"package": {"command": "npx", "args": ["@example/server"]}}
        candidate, = self.discover()
        response = io.BytesIO(json.dumps({"name": "@example/server", "version": "1.2.3", "bin": {"server": "start.js"}}).encode())
        with patch.object(share.urllib.request, "urlopen", return_value=response) as fetch:
            share.verify_public_plugins([candidate])
        self.assertEqual(fetch.call_args.args[0], "https://registry.npmjs.org/%40example%2Fserver/latest")
        with patch.object(share.urllib.request, "urlopen", side_effect=OSError(self.secret)), patch.object(
                share, "ShareGitHub") as github, redirect_stderr(io.StringIO()) as errors:
            code = share.main(["--home", str(self.home), "--codex-home", str(self.codex), "--state-root", str(self.state),
                               "--select", "mcp:package", "--yes"])
        self.assertEqual(code, 1)
        github.assert_not_called()
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

    def test_managed_http_cannot_bypass_private_path_projection(self):
        spec = normalize_mcp({"name": "remote", "kind": "http", "url": "https://example.com/" + self.secret})
        self.config["mcp_servers"] = {"remote": {"url": spec["url"]}}
        self.write_lock({"mcp": [{"name": "remote", "kind": "http", "declaration": spec,
                                  "declaration_sha256": declaration_hash(spec)}]})
        self.assertIsInstance(self.discover()[0], share.Blocked)
        code, _, _, api, _ = self.run_main(["--select", "mcp:remote", "--yes"])
        self.assertEqual(code, 1)
        api.assert_not_called()

    def test_managed_stdio_discards_lock_args_and_preserves_version_policy(self):
        for kind in ("npm", "python"):
            for version in ("latest", "1.2.3"):
                with self.subTest(kind=kind, version=version):
                    spec = normalize_mcp({"name": "service", "kind": kind, "package": "fixture-package",
                        "entrypoint": "server", "version": version, "args": ["--config", "./" + self.secret]})
                    launch = {"command": "node" if kind == "npm" else str(self.state / "python.exe"),
                              "args": [str(self.state / "server-script")]}
                    self.config["mcp_servers"] = {"service": {**launch, "args": launch["args"] + spec["args"]}}
                    self.write_lock({"mcp": [{"name": "service", "kind": kind, "declaration": spec,
                                              "declaration_sha256": declaration_hash(spec)}]})
                    with patch.object(share.mcp_packages, "configuration", return_value={**launch, "args": launch["args"] + spec["args"]}):
                        candidate, = self.discover()
                        self.assertEqual(candidate.declaration, {**spec, "args": []})
                        self.assertNotIn(self.secret, repr(candidate))
                        code, _, _, _, _ = self.run_main(["--select", "mcp:service", "--yes"])
                    self.assertEqual(code, 0)
                    uploaded = parse_registry(base64.b64decode(self.uploads[0][1]["content"]).decode())
                    self.assertEqual(uploaded.mcp[0], {**spec, "args": []})

    def test_existing_public_args_survive_merge_and_match_preview(self):
        self.npm()
        self.config["mcp_servers"] = {"package": {"command": "npx", "args": ["@example/server", self.secret]}}
        public = normalize_mcp({"name": "Package", "kind": "npm", "package": "@example/server",
                               "entrypoint": "server", "version": "1.0.0", "args": ["--mode", "public"]})
        self.remote_text = tomlkit.dumps({"schema_version": 1, "mcp": [public]})
        self.write_config()
        code, output, _, _, _ = self.run_main(["--select", "mcp:package", "--yes"])
        self.assertEqual(code, 0)
        uploaded = parse_registry(base64.b64decode(self.uploads[0][1]["content"]).decode())
        preview = output.split("registry.toml:\n", 1)[1].split("Per-PC", 1)[0]
        self.assertEqual(parse_registry(preview).mcp, uploaded.mcp)
        self.assertEqual(uploaded.mcp[0]["args"], public["args"])
        self.remote_text = base64.b64decode(self.uploads[0][1]["content"]).decode()
        code, output, _, _, _ = self.run_main(["--select", "mcp:package", "--yes"])
        self.assertEqual(code, 0)
        self.assertIn("Unchanged", output)
        self.assertEqual(self.uploads, [])

    def test_private_host_variants_block_offline_even_with_managed_lock(self):
        for host in ("localhost.", "127.1", "service.internal.", "service.corp.", "printer.local.",
                     "sub.localhost.", "service.lan.", "service.home.", "2130706433", "0x7f000001", "0177.0.0.1",
                     "127.1.", "service.internal\u3002"):
            for managed in (False, True):
                with self.subTest(host=host, managed=managed):
                    spec = normalize_mcp({"name": "remote", "kind": "http", "url": f"https://{host}/mcp"})
                    self.config["mcp_servers"] = {"remote": {"url": spec["url"]}}
                    self.write_lock({"mcp": [{"name": "remote", "kind": "http", "declaration": spec,
                        "declaration_sha256": declaration_hash(spec)}] if managed else []})
                    self.assertIsInstance(self.discover()[0], share.Blocked)
                    code, _, _, api, public = self.run_main(["--select", "mcp:remote", "--yes"])
                    self.assertEqual(code, 1)
                    api.assert_not_called()
                    public.assert_not_called()

    def test_npm_requires_selected_official_bin_before_github(self):
        self.npm(bins={"private-only-bin": "start.js"})
        self.config["mcp_servers"] = {"package": {"command": "npx", "args": ["@example/server@1.2.3"]}}
        self.write_config()
        for bins in ({"public-bin": "public.js"}, {}, {"private-only-bin": "../private.js"}):
            with self.subTest(bins=bins), patch.object(share.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps({
                    "name": "@example/server", "version": "1.2.3", "bin": bins}).encode())):
                code, _, _, api, _ = self.run_main(["--select", "mcp:package", "--yes"], verify=True)
                self.assertEqual(code, 1)
                api.assert_not_called()

    def test_python_name_and_empty_artifacts_are_insufficient(self):
        self.config["mcp_servers"] = {"service": {"command": "uvx", "args": ["--from", "fixture-package", "nonexistent-bin"]}}
        self.write_config()
        with patch.object(share.urllib.request, "urlopen", return_value=io.BytesIO(
                b'{"info":{"name":"fixture-package","version":"1.2.3"},"urls":[]}')):
            code, _, _, api, _ = self.run_main(["--select", "mcp:service", "--yes"], verify=True)
        self.assertEqual(code, 1)
        api.assert_not_called()

    def wheel(self, *, name="fixture-package", version="1.2.3", entry="server = fixture:main", tag="py3-none-any", requires_python=">=3.9"):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            archive.writestr("fixture_package-1.2.3.dist-info/WHEEL", f"Wheel-Version: 1.0\nTag: {tag}\n")
            archive.writestr("fixture_package-1.2.3.dist-info/METADATA",
                f"Metadata-Version: 2.1\nName: {name}\nVersion: {version}\nRequires-Python: {requires_python}\n")
            archive.writestr("fixture_package-1.2.3.dist-info/entry_points.txt", f"[console_scripts]\n{entry}\n")
        data = stream.getvalue()
        filename = "fixture_package-1.2.3-py3-none-any.whl"
        artifact = {"filename": filename, "packagetype": "bdist_wheel",
                    "url": f"https://files.pythonhosted.org/packages/fixture/{filename}",
                    "digests": {"sha256": hashlib.sha256(data).hexdigest()}, "requires_python": ">=3.9"}
        return data, {"info": {"name": "Fixture_Package", "version": "1.2.3"}, "urls": [artifact]}

    def test_python_public_wheel_proves_console_script_without_installing(self):
        for requested in ("fixture-package", "fixture-package==1.2.3"):
            with self.subTest(requested=requested):
                data, metadata = self.wheel()
                self.config["mcp_servers"] = {"service": {"command": "uvx", "args": ["--from", requested, "server", self.secret]}}
                self.write_config()
                with patch.object(share.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps(metadata).encode())) as fetch, patch.object(
                        share.urllib.request, "build_opener") as opener, patch.object(share.subprocess, "run", side_effect=AssertionError("No execution")):
                    opener.return_value.open.return_value = io.BytesIO(data)
                    code, _, _, _, _ = self.run_main(["--select", "mcp:service", "--yes"], verify=True)
                self.assertEqual(code, 0)
                self.assertEqual(fetch.call_count, 1)
                opener.return_value.open.assert_called_once_with(metadata["urls"][0]["url"], timeout=20)
                uploaded = parse_registry(base64.b64decode(self.uploads[0][1]["content"]).decode()).mcp[0]
                self.assertEqual(uploaded["version"], "latest" if "==" not in requested else "1.2.3")
                self.assertEqual(uploaded["args"], [])

    def test_python_wheel_identity_integrity_compatibility_and_entrypoint_are_required(self):
        self.config["mcp_servers"] = {"service": {"command": "uvx", "args": ["--from", "fixture-package", "server"]}}
        self.write_config()
        for changes in ({"entry": "other = fixture:main"}, {"entry": "server = "}, {"entry": "server = invalid"},
                        {"name": "another-package"}, {"version": "9.9.9"}, {"tag": "cp27-none-any"}, {"requires_python": ">=99"},
                        {"sha256": "0" * 64}, {"filename": "fixture_package-1.2.3-cp27-none-any.whl"}, {"requires_artifact_python": ">=99"}):
            with self.subTest(changes=changes):
                data, metadata = self.wheel(**{k: v for k, v in changes.items() if k not in {"sha256", "filename", "requires_artifact_python"}})
                if "sha256" in changes:
                    metadata["urls"][0]["digests"]["sha256"] = changes["sha256"]
                if "filename" in changes:
                    metadata["urls"][0]["filename"] = changes["filename"]
                if "requires_artifact_python" in changes:
                    metadata["urls"][0]["requires_python"] = changes["requires_artifact_python"]
                with patch.object(share.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps(metadata).encode())), patch.object(
                        share.urllib.request, "build_opener") as opener:
                    opener.return_value.open.return_value = io.BytesIO(data)
                    code, _, _, api, _ = self.run_main(["--select", "mcp:service", "--yes"], verify=True)
                self.assertEqual(code, 1)
                api.assert_not_called()

    def test_python_artifact_urls_cannot_fetch_private_or_arbitrary_hosts(self):
        self.config["mcp_servers"] = {"service": {"command": "uvx", "args": ["--from", "fixture-package", "server"]}}
        self.write_config()
        for prefix in ("https://localhost.", "https://127.1", "https://service.internal.", "https://arbitrary.example",
                       "https://files.pythonhosted.org.private.invalid", "http://files.pythonhosted.org",
                       "https://user@files.pythonhosted.org", "https://files.pythonhosted.org:8443"):
            with self.subTest(prefix=prefix):
                _, metadata = self.wheel()
                metadata["urls"][0]["url"] = prefix + "/" + metadata["urls"][0]["filename"]
                with patch.object(share.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps(metadata).encode())), patch.object(
                        share.urllib.request, "build_opener") as opener:
                    code, _, _, api, _ = self.run_main(["--select", "mcp:service", "--yes"], verify=True)
                self.assertEqual(code, 1)
                opener.assert_not_called()
                api.assert_not_called()

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
        with patch.dict(os.environ, {"GH_TOKEN": "ghp_dummy_caller", "GH_DEBUG": self.secret,
                "DEBUG": self.secret, "GH_HOST": self.secret, "GH_REPO": self.secret}), patch.object(
                share.subprocess, "run", return_value=completed) as run:
            self.assertEqual(share.ShareGitHub().api(f"{share.API}/contents/registry.toml", payload={"sha": self.remote_sha}), {"ok": True})
        command = run.call_args.args[0]
        self.assertIn("github.com", command)
        self.assertEqual(command[-2:], ["--input", "-"])
        self.assertEqual(json.loads(run.call_args.kwargs["input"]), {"sha": self.remote_sha})
        self.assertNotIn("GH_DEBUG", run.call_args.kwargs["env"])
        self.assertNotIn("DEBUG", run.call_args.kwargs["env"])

    def test_auth_denial_conflict_and_lost_write_response_are_not_retried(self):
        for status, message in ((401, "access denied"), (403, "access denied"), (409, "conflicted"), (422, "conflicted")):
            completed = subprocess.CompletedProcess([], 1, "", f"HTTP {status} {self.secret}")
            with patch.dict(os.environ, {"GH_TOKEN": "ghp_dummy_caller"}), patch.object(
                    share.subprocess, "run", return_value=completed) as run:
                with self.assertRaises(share.ShareError) as raised:
                    share.ShareGitHub().api(f"{share.API}/contents/registry.toml", payload={"sha": self.remote_sha})
                self.assertIn(message, str(raised.exception))
                self.assertNotIn(self.secret, str(raised.exception))
                self.assertEqual(run.call_count, 1)
        with patch.dict(os.environ, {"GH_TOKEN": "ghp_dummy_caller"}), patch.object(
                share.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, self.secret, "")) as run:
            with self.assertRaisesRegex(share.ShareError, "lost or invalid"):
                share.ShareGitHub().api(f"{share.API}/contents/registry.toml", payload={"sha": self.remote_sha})
            self.assertEqual(run.call_count, 1)


if __name__ == "__main__":
    unittest.main()
