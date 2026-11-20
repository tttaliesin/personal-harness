import copy
from contextlib import contextmanager
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "installer"))
import nuget_packages as nuget
from harness import HarnessError, safe_file
from windows_paths import io_path


VERSION = "1.4.23"
SDK = "10.0.404"
RUNTIME = "10.0.15"
SDK_URL = nuget._sdk_url(SDK)
BASE_URL = nuget._package_url(nuget.PACKAGE, VERSION)
RID_URL = nuget._package_url(nuget.RID_PACKAGE, VERSION)
PREFIX = "tools/net10.0/win-x64/"


@contextmanager
def TemporaryDirectory():
    # Content-addressed SHA512 cache names exceed MAX_PATH beneath Windows'
    # sandbox TEMP. Use the same extended-path cleanup as the existing suite.
    with tempfile.TemporaryDirectory(prefix="nuget-test-") as directory:
        try:
            yield directory
        finally:
            shutil.rmtree(io_path(Path(directory)))


def archive(files):
    result = io.BytesIO()
    with warnings.catch_warnings(), zipfile.ZipFile(result, "w") as output:
        warnings.simplefilter("ignore", UserWarning)
        for name, data in (files.items() if isinstance(files, dict) else files):
            if isinstance(name, str):
                entry = zipfile.ZipInfo(name)
                # Preserve malicious fixture spelling instead of letting
                # ZipInfo normalize backslashes on Windows before the test.
                entry.filename = entry.orig_filename = name
            else:
                entry = name
            output.writestr(entry, data)
    return result.getvalue()


def nuspec(package, package_type):
    return (f'<package xmlns="http://schemas.microsoft.com/packaging/2012/06/nuspec.xsd">'
            f'<metadata><id>{package}</id><version>{VERSION}</version><authors>Microsoft</authors>'
            f'<packageTypes><packageType name="{package_type}"/></packageTypes></metadata></package>').encode()


def fixtures(*, settings_version="2"):
    spec = {"name": "nuget", "kind": "nuget", "package": nuget.PACKAGE, "version": VERSION,
            "entrypoint": nuget.ENTRYPOINT, "args": [], "env_vars": ["FEED_TOKEN", "NUGET_PACKAGES"]}
    sdk_files = {"dotnet.exe": b"fixture host, never executed",
                 f"sdk/{SDK}/MSBuild.dll": b"fixture SDK",
                 f"sdk/{SDK}/Microsoft.Build.dll": b"fixture MSBuild",
                 f"host/fxr/{RUNTIME}/hostfxr.dll": b"fixture hostfxr",
                 f"shared/Microsoft.NETCore.App/{RUNTIME}/Microsoft.NETCore.App.deps.json": b"{}",
                 f"shared/Microsoft.AspNetCore.App/{RUNTIME}/Microsoft.AspNetCore.App.deps.json": b"{}",
                 f"sdk/{SDK}/FSharp/한글 [test] &.dll": b"unicode path"}
    base_files = {nuget.PACKAGE + ".nuspec": nuspec(nuget.PACKAGE, "DotnetTool"),
                  "tools/any/any/DotnetToolSettings.xml": (
                      '<DotNetCliTool Version="2"><Commands><Command Name="nuget-mcp-server"/></Commands>'
                      '<RuntimeIdentifierPackages><RuntimeIdentifierPackage RuntimeIdentifier="win-x64" '
                      'Id="NuGet.Mcp.Server.win-x64"/></RuntimeIdentifierPackages></DotNetCliTool>').encode()}
    rid_files = {nuget.RID_PACKAGE + ".nuspec": nuspec(nuget.RID_PACKAGE, "DotnetToolRidPackage"),
                 PREFIX + "DotnetToolSettings.xml": (
                     f'<DotNetCliTool Version="{settings_version}"><Commands><Command Name="nuget-mcp-server" '
                     'EntryPoint="NuGet.Mcp.Server.exe" Runner="executable"/></Commands></DotNetCliTool>').encode(),
                 nuget.DLL: b"fixture net10 DLL, never executed",
                 PREFIX + "NuGet.Mcp.Server.exe": b"fixture apphost, never executed",
                 PREFIX + "NuGet.Mcp.Server.deps.json": b"{}",
                 PREFIX + "NuGet.Mcp.Server.runtimeconfig.json": json.dumps({"runtimeOptions": {
                     "tfm": "net10.0", "rollForward": "LatestMajor", "frameworks": [
                         {"name": "Microsoft.NETCore.App", "version": "10.0.5"},
                         {"name": "Microsoft.AspNetCore.App", "version": "10.0.5"}]}}).encode(),
                 "tools/net11.0/win-x64/NuGet.Mcp.Server.dll": b"fixture net11 DLL"}
    sdk_bytes = archive(sdk_files)
    metadata = {"channel-version": "10.0", "release-type": "lts", "latest-sdk": SDK,
                "releases": [{"sdk": {"version": SDK, "runtime-version": RUNTIME,
                    "files": [{"name": "dotnet-sdk-win-x64.zip", "rid": "win-x64", "url": SDK_URL,
                               "hash": hashlib.sha512(sdk_bytes).hexdigest()}]}}]}
    sources = {nuget.RELEASES_URL: json.dumps(metadata).encode(), SDK_URL: sdk_bytes,
               BASE_URL: archive(base_files), RID_URL: archive(rid_files),
               f"{nuget.FLAT}/{nuget.PACKAGE.lower()}/index.json": json.dumps({
                   "versions": ["1.4.9", "1.4.16", VERSION, "2.0.0-rc.1"]}).encode()}
    return spec, sources, sdk_files, base_files, rid_files


class NugetPackagesTests(unittest.TestCase):
    def setUp(self):
        self.spec, self.sources, self.sdk_files, self.base_files, self.rid_files = fixtures()
        self.fetch = patch.object(nuget, "_fetch", side_effect=self.sources.__getitem__).start()
        self.addCleanup(patch.stopall)
        patch.object(nuget.platform, "system", return_value="Windows").start()
        patch.object(nuget.platform, "machine", return_value="AMD64").start()

    def resolve(self):
        return nuget.resolve(self.spec)

    def replace_sdk(self, data):
        self.sources[SDK_URL] = data
        metadata = json.loads(self.sources[nuget.RELEASES_URL])
        metadata["releases"][0]["sdk"]["files"][0]["hash"] = hashlib.sha512(data).hexdigest()
        self.sources[nuget.RELEASES_URL] = json.dumps(metadata).encode()

    def test_resolve_pins_sdk_metadata_without_fetching_sdk_and_selects_net10(self):
        original = copy.deepcopy(self.spec)
        self.spec["package"] = "nuget.mcp.SERVER"
        recipe = self.resolve()
        self.assertEqual(recipe["package"], nuget.PACKAGE)
        self.assertEqual(recipe["target"], {"platform": "win32", "arch": "x64"})
        self.assertEqual(recipe["dll"], nuget.DLL)
        self.assertEqual(set(recipe["sdk"]), {"version", "runtime_version", "url", "sha512"})
        self.assertEqual(recipe["sdk"]["sha512"], hashlib.sha512(self.sources[SDK_URL]).hexdigest())
        self.assertEqual(recipe["rid"]["files"][nuget.DLL], hashlib.sha256(self.rid_files[nuget.DLL]).hexdigest())
        self.assertNotIn(SDK_URL, [call.args[0] for call in self.fetch.call_args_list])
        self.assertNotIn("file:", json.dumps(recipe))
        self.assertEqual(self.spec, {**original, "package": "nuget.mcp.SERVER"})

    def test_latest_selects_numeric_stable_version_without_prerelease(self):
        self.spec["version"] = "latest"
        self.assertEqual(self.resolve()["version"], VERSION)

    def test_official_package_and_entrypoint_only_and_numeric_exact_versions(self):
        for fields in ({"package": "Other.Server"}, {"entrypoint": "other"}, {"version": "1.*"},
                       {"version": "1.4.23-preview"}, {"version": "[1.0,2.0)"}, {"version": "01.4.23"}):
            with self.subTest(fields=fields), self.assertRaises(ValueError):
                nuget.resolve({**self.spec, **fields})
        self.fetch.assert_not_called()

    def test_published_rid_package_type_and_version_two_are_accepted(self):
        recipe = self.resolve()
        nuget.validate(recipe, self.spec)
        self.assertEqual(recipe["rid"]["id"], nuget.RID_PACKAGE)
        for version in ("1", "2"):
            with self.subTest(settings_version=version):
                _, sources, _, _, _ = fixtures(settings_version=version)
                with patch.object(nuget, "_fetch", side_effect=sources.__getitem__):
                    self.assertEqual(self.resolve()["entrypoint"], nuget.ENTRYPOINT)

    def test_validate_is_offline_and_rejects_tampered_lock_fields(self):
        recipe = self.resolve()
        mutations = [("sdk", "url", "https://example.com/sdk.zip"), ("sdk", "sha512", "bad"),
                     ("sdk", "version", "11.0.100"), ("base", "version", "1.4.22"),
                     ("rid", "id", "Other.Server.win-x64")]
        with patch.object(nuget, "_fetch", side_effect=AssertionError("offline validation contacted network")):
            nuget.validate(recipe, self.spec)
            for artifact, field, value in mutations:
                altered = copy.deepcopy(recipe)
                altered[artifact][field] = value
                with self.subTest(artifact=artifact, field=field), self.assertRaises(ValueError):
                    nuget.validate(altered, self.spec)
            with self.assertRaises(ValueError):
                nuget.validate(recipe, {**self.spec, "args": ["changed"]})

    def test_preflight_only_accepts_windows_x64_without_installed_dotnet(self):
        recipe = self.resolve()
        with patch.object(nuget, "_fetch", side_effect=AssertionError("preflight contacted network")):
            nuget.preflight(recipe)
            for system, machine in (("Linux", "x86_64"), ("Windows", "ARM64"), ("Windows", "x86")):
                with self.subTest(system=system, machine=machine), \
                        patch.object(nuget.platform, "system", return_value=system), \
                        patch.object(nuget.platform, "machine", return_value=machine), self.assertRaises(ValueError):
                    nuget.preflight(recipe)

    def test_configuration_uses_private_dotnet_exec_and_external_mutable_paths(self):
        self.spec["args"] = ["--fixture"]
        recipe = self.resolve()
        with TemporaryDirectory() as directory:
            state = Path(directory) / "state"
            root = state / "tools/mcp/nuget/record"
            project = Path(directory) / "project"
            project.mkdir()
            (project / "global.json").write_text('{"sdk":{"version":"8.0.100"}}')
            (project / "NuGet.Config").write_text("project feeds must remain untouched")
            original = {path.name: path.read_bytes() for path in project.iterdir()}
            environment = dict(os.environ)
            config = nuget.configuration(recipe, root, state, "nuget")
            self.assertEqual(config["command"], str(root / "dotnet/dotnet.exe"))
            self.assertEqual(config["args"], ["exec", str(root / "package" / nuget.DLL), "--fixture"])
            self.assertEqual(config["env_vars"], self.spec["env_vars"])
            self.assertEqual(config["env"]["DOTNET_ROOT_X64"], str(root / "dotnet"))
            self.assertEqual(config["env"]["DOTNET_ROLL_FORWARD"], "LatestPatch")
            for path in (Path(config["cwd"]), Path(config["env"]["DOTNET_CLI_HOME"])):
                self.assertTrue(path.is_relative_to(state))
                self.assertFalse(path.is_relative_to(root))
            self.assertFalse(any(key.upper().startswith("NUGET") or key == "PATH" for key in config["env"]))
            self.assertNotIn("MSBuildSDKsPath", config["env"])
            self.assertEqual(os.environ, environment)
            self.assertEqual({path.name: path.read_bytes() for path in project.iterdir()}, original)
            self.assertFalse(state.exists())

    def test_install_replays_managed_cache_and_mutable_home_cannot_change_receipt_tree(self):
        recipe = self.resolve()
        with TemporaryDirectory() as directory:
            state = Path(directory)
            root = state / "tools/mcp/nuget/record"
            nuget.install(recipe, root, state, safe_file)
            self.assertEqual(io_path(root / "package" / nuget.DLL).read_bytes(), self.rid_files[nuget.DLL])
            self.assertEqual(nuget.launch(recipe, root), root / "dotnet/dotnet.exe")
            self.assertTrue(io_path(state / "tools/mcp-cache/nuget/artifacts" / (recipe["sdk"]["sha512"] + ".zip")).is_file())
            receipt = root / "receipt.json"
            receipt.write_bytes(b"main-owned receipt")
            tree = {path.relative_to(root).as_posix(): path.read_bytes() for path in root.rglob("*") if path.is_file()}
            config = nuget.configuration(recipe, root, state, "nuget")
            self.assertTrue(Path(config["cwd"]).is_dir())
            (Path(config["env"]["DOTNET_CLI_HOME"]) / "sentinel").write_text("mutable")
            self.assertEqual({path.relative_to(root).as_posix(): path.read_bytes() for path in root.rglob("*") if path.is_file()}, tree)
            io_path(root / "package" / nuget.DLL).write_bytes(b"damaged installed DLL")
            with patch.object(nuget, "_fetch", side_effect=AssertionError("cached replay used network")):
                nuget.install(recipe, root, state, safe_file)
            self.assertEqual(io_path(root / "package" / nuget.DLL).read_bytes(), self.rid_files[nuget.DLL])
            self.assertEqual(receipt.read_bytes(), b"main-owned receipt")

    def test_bad_sdk_sha512_aborts_before_extracting_any_package(self):
        recipe = self.resolve()
        self.sources[SDK_URL] += b"tampered"
        with TemporaryDirectory() as directory:
            state, root = Path(directory), Path(directory) / "record"
            with self.assertRaisesRegex(ValueError, "SHA512 mismatch"):
                nuget.install(recipe, root, state, safe_file)
            self.assertFalse(root.exists())

    def test_bad_rid_file_manifest_aborts_before_extracting(self):
        recipe = self.resolve()
        recipe["rid"]["files"][nuget.DLL] = "0" * 64
        with TemporaryDirectory() as directory:
            state, root = Path(directory), Path(directory) / "record"
            with self.assertRaisesRegex(ValueError, "file manifest mismatch"):
                nuget.install(recipe, root, state, safe_file)
            self.assertFalse(root.exists())

    def test_untrusted_zip_paths_are_rejected_even_with_a_matching_sdk_sha512(self):
        for name in ("../escape", "/escape", "C:/escape", "folder\\escape", "x/../../escape",
                     "file:stream", "AUX.txt", "folder./escape", "folder /escape", "a//b", "a/./b"):
            with self.subTest(path=name), TemporaryDirectory() as directory:
                self.replace_sdk(archive({**self.sdk_files, name: b"unsafe"}))
                recipe = self.resolve()
                state, root = Path(directory), Path(directory) / "record"
                with self.assertRaisesRegex(ValueError, "Unsafe"):
                    nuget.install(recipe, root, state, safe_file)
                self.assertFalse(root.exists())
                self.assertFalse((state.parent / "escape").exists())

    def test_zip_links_and_windows_aliases_are_rejected(self):
        link = zipfile.ZipInfo("linked")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        cases = [list(self.sdk_files.items()) + [(link, b"../../outside")],
                 list(self.sdk_files.items()) + [("DOTNET.EXE", b"alias")],
                 list(self.sdk_files.items()) + [("collision", b"file"), ("collision/child", b"child")]]
        for files in cases:
            with self.subTest(extra=str(files[-1][0])), TemporaryDirectory() as directory:
                self.replace_sdk(archive(files))
                recipe = self.resolve()
                with self.assertRaises(ValueError):
                    nuget.install(recipe, Path(directory) / "record", Path(directory), safe_file)

    def test_sdk_must_include_aspnet_runtime_and_msbuild(self):
        for name in (f"shared/Microsoft.AspNetCore.App/{RUNTIME}/Microsoft.AspNetCore.App.deps.json", f"sdk/{SDK}/Microsoft.Build.dll"):
            with self.subTest(missing=name), TemporaryDirectory() as directory:
                self.replace_sdk(archive({key: value for key, value in self.sdk_files.items() if key != name}))
                recipe = self.resolve()
                with self.assertRaisesRegex(ValueError, "SDK ZIP lacks"):
                    nuget.install(recipe, Path(directory) / "record", Path(directory), safe_file)

    def test_package_identity_indirection_and_net10_payload_are_checked(self):
        cases = [("identity", {nuget.RID_PACKAGE + ".nuspec": nuspec("Other.Server", "DotnetToolRidPackage")}),
                 ("tool type", {nuget.RID_PACKAGE + ".nuspec": nuspec(nuget.RID_PACKAGE, "DotnetTool")}),
                 ("entrypoint", {PREFIX + "DotnetToolSettings.xml": self.rid_files[PREFIX + "DotnetToolSettings.xml"].replace(b"Runner=\"executable\"", b"Runner=\"dotnet\"")})]
        for label, changes in cases:
            with self.subTest(case=label), self.assertRaises(ValueError):
                self.sources[RID_URL] = archive({**self.rid_files, **changes})
                self.resolve()
        self.sources[RID_URL] = archive({key: value for key, value in self.rid_files.items() if key != nuget.DLL})
        with self.assertRaises(ValueError):
            self.resolve()
        self.sources[RID_URL] = archive(self.rid_files)
        settings = "tools/any/any/DotnetToolSettings.xml"
        self.sources[BASE_URL] = archive({**self.base_files, settings: self.base_files[settings].replace(b"NuGet.Mcp.Server.win-x64", b"Other.Server.win-x64")})
        with self.assertRaisesRegex(ValueError, "indirection"):
            self.resolve()

    def test_guard_rejects_installation_outside_managed_state(self):
        recipe = self.resolve()
        with TemporaryDirectory() as directory:
            self.fetch.reset_mock()
            with self.assertRaises(HarnessError):
                nuget.install(recipe, Path(directory) / "outside", Path(directory) / "state", safe_file)
            self.fetch.assert_not_called()

    def test_sdk_metadata_must_be_official_stable_lts_and_have_sha512(self):
        original = json.loads(self.sources[nuget.RELEASES_URL])
        for fields in ({"channel-version": "11.0"}, {"release-type": "sts"}, {"latest-sdk": "10.0.405-preview.1"}):
            self.sources[nuget.RELEASES_URL] = json.dumps({**original, **fields}).encode()
            with self.subTest(fields=fields), self.assertRaises(ValueError):
                self.resolve()
        original["releases"][0]["sdk"]["files"][0]["hash"] = "invalid"
        self.sources[nuget.RELEASES_URL] = json.dumps(original).encode()
        with self.assertRaisesRegex(ValueError, "SHA512"):
            self.resolve()

    def test_xml_dtd_and_non_official_artifact_urls_are_rejected(self):
        with self.assertRaises(ValueError):
            nuget._xml(b'<!DOCTYPE metadata [<!ENTITY x "expansion">]><metadata>&x;</metadata>')
        for url in ("http://api.nuget.org/a", "https://api.nuget.org@evil.invalid/a", "https://api.nuget.org/a?token=x", "https://example.com/sdk.zip"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                nuget._url(url)


if __name__ == "__main__":
    unittest.main()
