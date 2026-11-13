"""Portable registry validation and offline desired-lock reconciliation."""
import copy
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import tomlkit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from registry import declaration_hash, load_registry, lock_issues
import install_dependencies as installer


class RegistryTests(unittest.TestCase):
    def plugin(self, **changes):
        return {"name": "example", "marketplace": "example-market",
                "source": "https://github.com/example/plugins.git", "channel": "latest-release",
                "manifest": "plugins/example/.codex-plugin/plugin.json", **changes}

    def load(self, **changes):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "registry.toml"
            path.write_text(tomlkit.dumps({"schema_version": 1, **changes}), encoding="utf-8")
            return load_registry(path)

    def record(self, spec, **changes):
        return {"name": spec["name"], "marketplace": spec["marketplace"], "source": spec["source"],
                "manifest": spec["manifest"], "version": "1.0.0", "ref": "a" * 40,
                "ref_basis": "Official stable release v1.0.0", "content_sha256": "b" * 64,
                "declaration": copy.deepcopy(spec), "declaration_sha256": declaration_hash(spec), **changes}

    def lock(self, desired):
        lock = {"schema_version": 2, "registry_sha256": desired.fingerprint,
                "registrations": {"plugins": list(desired.plugins), "mcp": list(desired.mcp)},
                "plugins": [self.record(spec) for spec in desired.plugins],
                "mcp": [{"name": spec["name"], "kind": spec["kind"], "declaration": spec,
                         "declaration_sha256": declaration_hash(spec)} for spec in desired.mcp]}
        return copy.deepcopy(lock)

    def test_comments_table_order_and_equivalent_defaults_preserve_fingerprint(self):
        first = self.plugin()
        second = self.plugin(name="other", manifest="plugins/other/plugin.json")
        mcp = {"name": "python-service", "kind": "python", "package": "Example_Package",
               "entrypoint": "example", "env_vars": ["Z_TOKEN", "A_KEY"]}
        expected = self.load(plugins=[first, second], mcp=[mcp])
        normalized_mcp = {**mcp, "package": "example-package", "version": "latest", "args": [],
                          "env_vars": ["A_KEY", "Z_TOKEN", "Z_TOKEN"]}
        with TemporaryDirectory() as directory:
            path = Path(directory) / "registry.toml"
            path.write_text("# different comment\n" + tomlkit.dumps({"mcp": [normalized_mcp],
                "plugins": [{**second, "enabled": True}, {**first, "enabled": True,
                            "source": "https://GITHUB.COM:443/example/plugins/"}], "schema_version": 1}), encoding="utf-8")
            actual = load_registry(path)
        self.assertEqual(actual, expected)
        self.assertEqual(declaration_hash({"z": 1, "a": 2}), declaration_hash({"a": 2, "z": 1}))

    def test_empty_arrays_default_and_missing_registry_is_an_error(self):
        empty = self.load()
        self.assertEqual((empty.plugins, empty.mcp), ((), ()))
        self.assertEqual(lock_issues(empty, {"schema_version": 1}), [])
        with TemporaryDirectory() as directory:
            with self.assertRaises(FileNotFoundError):
                load_registry(Path(directory) / "missing.toml")
            with patch.object(installer, "REPO", Path(directory)):
                with self.assertRaises(FileNotFoundError):
                    installer.resolve({"schema_version": 1}, locked=True)

    def test_rejects_unknown_fields_duplicates_and_unsafe_plugin_paths(self):
        for data in ({"schema_version": 9}, {"auth": "secret"}, {"plugins": {}},
                     {"plugins": [self.plugin(), self.plugin()]},
                     {"plugins": [self.plugin(), self.plugin(name="EXAMPLE")]},
                     {"plugins": [self.plugin(unknown=True)]},
                     {"plugins": [self.plugin(enabled="true")]},
                     {"plugins": [self.plugin(name="../escape")]},
                     {"plugins": [self.plugin(name="CON")]},
                     *({"plugins": [self.plugin(manifest=path)]} for path in (
                         "../plugin.json", "/plugin.json", "C:/plugin.json", "a\\plugin.json",
                         "a//plugin.json", "a/./plugin.json", "a/metadata.json"))):
            with self.subTest(data=data), self.assertRaises(ValueError):
                self.load(**data)

    def test_channels_and_shared_marketplace_policy_are_validated(self):
        cases = [self.plugin(channel="unknown"), self.plugin(ref="main"),
                 self.plugin(source="https://gitlab.com/example/plugins.git"),
                 self.plugin(channel="git-ref"), self.plugin(channel="git-ref", ref="--upload-pack=bad"),
                 self.plugin(channel="git-ref", ref="refs/../bad")]
        for spec in cases:
            with self.subTest(spec=spec), self.assertRaises(ValueError):
                self.load(plugins=[spec])
        for ref in ("main", "v1.2.3", "refs/heads/topic/name", "a" * 40):
            result = self.load(plugins=[self.plugin(channel="git-ref", ref=ref,
                                                  source="https://git.example.test/group/repo.git")])
            self.assertEqual(result.plugins[0]["ref"], ref)
        with self.assertRaisesRegex(ValueError, "marketplace"):
            self.load(plugins=[self.plugin(), self.plugin(name="other", source="https://github.com/other/plugins.git")])

    def test_mcp_kinds_normalize_without_reading_environment(self):
        entries = [{"name": "npm-service", "kind": "npm", "package": "@example/server", "entrypoint": "server"},
                   {"name": "python-service", "kind": "python", "package": "Example_Server", "entrypoint": "server"},
                   {"name": "remote-service", "kind": "http", "url": "https://example.test/mcp",
                    "bearer_token_env_var": "EXAMPLE_TOKEN"}]
        result = self.load(mcp=entries)
        self.assertEqual(result.mcp[0]["version"], "latest")
        self.assertEqual(result.mcp[0]["args"], [])
        self.assertEqual(result.mcp[0]["env_vars"], [])
        self.assertEqual(result.mcp[1]["package"], "example-server")
        self.assertEqual(result.mcp[2], entries[2])
        self.assertEqual(load_registry(installer.REPO / "registry.toml").mcp, ())

    def test_credential_errors_do_not_contain_values(self):
        secret = "credential-sentinel-123456"
        specs = [{"plugins": [self.plugin(source=f"https://user:{secret}@github.com/example/plugins.git")]},
                 {"mcp": [{"name": "remote", "kind": "http", "url": f"https://example.test/mcp?token={secret}"}]},
                 {"mcp": [{"name": "remote", "kind": "http", "url": "https://example.test/mcp", "bearer_token": secret}]},
                 {"mcp": [{"name": "remote", "kind": "http", "url": "https://example.test/mcp", "bearer_token_env_var": f"TOKEN={secret}"}]},
                 {"mcp": [{"name": "server", "kind": "npm", "package": "example", "entrypoint": "example",
                           "args": [f"--api-key={secret}"]}]},
                 {"mcp": [{"name": "server", "kind": "npm", "package": "example", "entrypoint": "example",
                           "env_vars": {"TOKEN": secret}}]}]
        for data in specs:
            with self.subTest(data=data):
                with self.assertRaises(ValueError) as raised:
                    self.load(**data)
                self.assertNotIn(secret, str(raised.exception))
        with TemporaryDirectory() as directory:
            path = Path(directory) / "registry.toml"
            path.write_text(f'schema_version = 1\npassword = "{secret}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Invalid registry TOML") as raised:
                load_registry(path)
            self.assertNotIn(secret, str(raised.exception))

    def test_mcp_rejects_reserved_names_paths_version_ranges_and_variant_fields(self):
        base = {"name": "example", "kind": "npm", "package": "example", "entrypoint": "example"}
        for changes in ({"name": "node_repl"}, {"name": "codegraph"}, {"name": "../escape"},
                        {"package": "https://example.test/package.tgz"}, {"version": "^1.0.0"},
                        {"entrypoint": "../cli.js"}, {"args": ["C:/private/file"]}, {"args": "/private/file"},
                        {"args": ["--config=C:/private/file"]}, {"args": ["--config=file:///private/file"]},
                        {"args": ["https://user:password@example.test/mcp"]},
                        {"env_vars": ["TOKEN=value"]}, {"url": "https://example.test"}, {"kind": "shell"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.load(mcp=[{**base, **changes}])
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            self.load(mcp=[base, base])
        for url in ("http://example.test/mcp", "https://localhost/mcp", "https://127.0.0.1/mcp", "https://10.1.0.1/mcp"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                self.load(mcp=[{"name": "remote", "kind": "http", "url": url}])

    def test_v2_membership_fingerprints_and_declarations_are_checked_without_effects(self):
        desired = self.load(plugins=[self.plugin()], mcp=[{"name": "remote", "kind": "http", "url": "https://example.test/mcp"}])
        lock = self.lock(desired)
        before = copy.deepcopy(lock)
        self.assertEqual(lock_issues(desired, lock), [])
        self.assertEqual(lock, before)
        for field in ("registry_sha256", "registrations", "plugins", "mcp"):
            changed = copy.deepcopy(lock)
            changed.pop(field)
            with self.subTest(field=field):
                self.assertTrue(lock_issues(desired, changed))
        for group in ("plugins", "mcp"):
            for field in ("declaration", "declaration_sha256"):
                changed = copy.deepcopy(lock)
                changed[group][0].pop(field)
                with self.subTest(group=group, field=field):
                    self.assertTrue(lock_issues(desired, changed))
        for changes in ({"source": "https://other.test/repo.git"}, {"manifest": "other/plugin.json"},
                        {"ref": "main"}, {"version": "../../escape"}, {"content_sha256": "bad"}):
            changed = copy.deepcopy(lock)
            changed["plugins"][0].update(changes)
            with self.subTest(changes=changes):
                self.assertTrue(lock_issues(desired, changed))

    def test_v1_adoption_requires_matching_release_evidence_and_no_mcp_additions(self):
        desired = self.load(plugins=[self.plugin()])
        legacy = self.lock(desired)
        legacy["schema_version"] = 1
        legacy.pop("registrations")
        legacy.pop("registry_sha256")
        for record in legacy["plugins"]:
            record.pop("declaration")
            record.pop("declaration_sha256")
        self.assertEqual(lock_issues(desired, legacy), [])
        for changes in ({"source": "https://other.test/repo.git"}, {"manifest": "other/plugin.json"},
                        {"ref_basis": "branch main"}, {"ref_basis": "Official stable release v2.0.0"},
                        {"version": "1.0.0-rc.1"}, {"content_sha256": None}):
            changed = copy.deepcopy(legacy)
            changed["plugins"][0].update(changes)
            with self.subTest(changes=changes):
                self.assertTrue(lock_issues(desired, changed))
        with_mcp = self.load(plugins=[self.plugin()], mcp=[{"name": "remote", "kind": "http", "url": "https://example.test/mcp"}])
        self.assertTrue(lock_issues(with_mcp, legacy))
        legacy["plugins"] = []
        self.assertTrue(lock_issues(desired, legacy))

    def test_v1_git_ref_adoption_needs_exact_requested_commit(self):
        exact = self.load(plugins=[self.plugin(channel="git-ref", ref="a" * 40)])
        lock = self.lock(exact)
        lock["schema_version"] = 1
        self.assertEqual(lock_issues(exact, lock), [])
        branch = self.load(plugins=[self.plugin(channel="git-ref", ref="main")])
        self.assertTrue(lock_issues(branch, lock))
        lock["plugins"][0]["ref"] = "b" * 40
        self.assertTrue(lock_issues(exact, lock))

    def test_lock_issue_messages_never_echo_record_values(self):
        desired = self.load(plugins=[self.plugin()])
        lock = self.lock(desired)
        lock["plugins"][0].update(source="https://user:credential-sentinel@example.test/repo.git", ref="credential-sentinel")
        self.assertNotIn("credential-sentinel", " ".join(lock_issues(desired, lock)))
        lock["plugins"][0]["name"] = ["malformed"]
        self.assertTrue(lock_issues(desired, lock))


if __name__ == "__main__":
    unittest.main()
