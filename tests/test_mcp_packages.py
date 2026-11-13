import base64
from contextlib import contextmanager
import copy
import csv
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
from tempfile import TemporaryDirectory
import threading
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import mcp_packages as mcp
from harness import HarnessError, safe_file
from windows_paths import io_path


def spec(kind):
    return {"name": "fixture", "kind": kind, "package": "fixture-mcp", "version": "1.0.0",
            "entrypoint": "fixture-mcp", "args": [], "env_vars": ["FIXTURE_TOKEN"]}


def wheel(name, files, *, requires=(), entrypoint=None, python=">=3.9", tag="py3-none-any"):
    stem = name.replace("-", "_")
    prefix = f"{stem}-1.0.0.dist-info"
    contents = dict(files)
    metadata = f"Metadata-Version: 2.1\nName: {name}\nVersion: 1.0.0\nRequires-Python: {python}\n"
    metadata += "".join(f"Requires-Dist: {dependency}\n" for dependency in requires)
    contents[f"{prefix}/METADATA"] = metadata.encode()
    contents[f"{prefix}/WHEEL"] = f"Wheel-Version: 1.0\nGenerator: fixture\nRoot-Is-Purelib: true\nTag: {tag}\n".encode()
    if entrypoint:
        contents[f"{prefix}/entry_points.txt"] = f"[console_scripts]\nfixture-mcp = {entrypoint}\n".encode()
    records = io.StringIO(newline="")
    writer = csv.writer(records)
    for path, data in contents.items():
        digest = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=").decode()
        writer.writerow([path, "sha256=" + digest, len(data)])
    writer.writerow([f"{prefix}/RECORD", "", ""])
    contents[f"{prefix}/RECORD"] = records.getvalue().encode()
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w") as archive:
        for path, data in contents.items():
            archive.writestr(path, data)
    return f"{stem}-1.0.0-{tag}.whl", result.getvalue()


@contextmanager
def python_fixture(root, *, python=">=3.9"):
    wheelhouse = root / "source wheels"
    wheelhouse.mkdir()
    program = ("import json,sys\nfrom fixture_dep import VALUE\n"
               "def main():\n"
               "    for line in sys.stdin:\n"
               "        request=json.loads(line)\n"
               "        print(json.dumps({'jsonrpc':'2.0','id':request['id'],'result':"
               "{'protocolVersion':'2024-11-05','capabilities':{},'serverInfo':"
               "{'name':VALUE,'version':'1.0.0'},'prefix':sys.prefix}}),flush=True)\n")
    artifacts = dict([wheel("fixture-dep", {"fixture_dep.py": b"VALUE = 'wheel-closure'\n"}),
                      wheel("fixture-mcp", {"fixture_mcp.py": program.encode()},
                            requires=["fixture-dep==1.0.0"], entrypoint="fixture_mcp:main", python=python)])
    for filename, data in artifacts.items():
        (wheelhouse / filename).write_bytes(data)
    execute = mcp._run

    def offline(command, **kwargs):
        if "--dry-run" not in command:
            return execute(command, **kwargs)
        result = execute([*command, "--no-index", "--find-links", str(wheelhouse)], **kwargs)
        report_path = Path(command[command.index("--report") + 1])
        report = json.loads(report_path.read_bytes())
        for item in report["install"]:
            filename = Path(mcp.urllib.parse.unquote(mcp.urllib.parse.urlsplit(item["download_info"]["url"]).path)).name
            item["download_info"]["url"] = "https://wheels.invalid/" + filename
        report_path.write_bytes(mcp._json(report))
        return result

    with patch.object(mcp, "_run", side_effect=offline), \
            patch.object(mcp, "_fetch", side_effect=lambda url: artifacts[url.rsplit("/", 1)[-1]]):
        yield artifacts


def npm_archive(root, name, files, **fields):
    manifest = {"name": name, "version": "1.0.0", **fields}
    contents = {"package.json": mcp._json(manifest), **files}
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz") as archive:
        for path, data in contents.items():
            entry = tarfile.TarInfo("package/" + path)
            entry.size = len(data)
            entry.mode = 0o755 if path.endswith(".js") else 0o644
            archive.addfile(entry, io.BytesIO(data))
    data = output.getvalue()
    path = root / f"{name}-1.0.0.tgz"
    path.write_bytes(data)
    return path, "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()


@contextmanager
def npm_fixture(root, *, engine=">=20", dependency_name="fixture-dep"):
    command, _ = mcp._npm_tools()
    seed = root / "seed cache"
    program = (f"const readline=require('node:readline');const dep=require('{dependency_name}');"
               "readline.createInterface({input:process.stdin}).on('line',line=>{const q=JSON.parse(line);"
               "console.log(JSON.stringify({jsonrpc:'2.0',id:q.id,result:{protocolVersion:'2024-11-05',"
               "capabilities:{},serverInfo:{name:dep,version:'1.0.0'},args:process.argv.slice(2)}}));});")
    dependency, dep_integrity = npm_archive(root, dependency_name, {"index.js": b"module.exports='npm-closure';"})
    package, integrity = npm_archive(root, "fixture-mcp", {"cli.js": program.encode()},
                                     bin={"fixture-mcp": "cli.js"}, dependencies={dependency_name: "1.0.0"},
                                     engines={"node": engine}, scripts={"preinstall": "exit 99"})
    for archive in (dependency, package):
        mcp._run([*command, "cache", "add", str(archive), "--cache", str(seed), "--offline"])
    packuments = {}
    for archive, checksum in ((dependency, dep_integrity), (package, integrity)):
        with tarfile.open(archive) as stream:
            manifest = json.loads(stream.extractfile("package/package.json").read())
        manifest["dist"] = {"tarball": "https://npm.invalid/" + archive.name, "integrity": checksum}
        packuments["/" + manifest["name"]] = {"name": manifest["name"], "dist-tags": {"latest": "1.0.0"},
                                             "versions": {"1.0.0": manifest}}

    class Registry(BaseHTTPRequestHandler):
        def do_GET(self):
            document = packuments.get(self.path)
            self.send_response(200 if document else 404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(mcp._json(document or {"error": "fixture package absent"}))

        def log_message(self, format, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Registry)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    registry = f"http://127.0.0.1:{server.server_port}"
    npmrc = root / "fixture.npmrc"
    npmrc.write_text("")
    global_npmrc = root / "global.npmrc"
    global_npmrc.write_text("")
    execute = mcp._npm

    def offline(command, arguments, directory, cache):
        if not io_path(cache).exists():
            shutil.copytree(io_path(seed), io_path(cache))
        flags = ["--registry", registry] if "--package-lock-only" in arguments else ["--offline"]
        return execute(command, [*arguments, *flags], directory, cache)

    try:
        with patch.object(mcp, "_npm", side_effect=offline), \
                patch.dict(os.environ, {"NPM_CONFIG_USERCONFIG": str(npmrc), "NPM_CONFIG_GLOBALCONFIG": str(global_npmrc)}):
            yield
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def initialize(config):
    request = {"jsonrpc": "2.0", "id": 7, "method": "initialize",
               "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                          "clientInfo": {"name": "fixture", "version": "1.0"}}}
    result = subprocess.run([config["command"], *config["args"]], executable=config["command"],
                            input=json.dumps(request) + "\n",
                            capture_output=True, text=True, encoding="utf-8", timeout=20)
    if result.returncode:
        raise AssertionError(f"Isolated fixture executable failed with exit code {result.returncode}")
    return json.loads(result.stdout)


class McpPackagesTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node") and shutil.which("npm"), "Node and npm are required")
    def test_real_npm_replay_with_package_root_over_300_characters(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / ("state [client] & 한글 " + "x" * 100) / ("y" * 100)
            try:
                with npm_fixture(root, dependency_name="JSONStream"):
                    record = mcp.resolve(spec("npm"))
                    original = copy.deepcopy(record)
                    package_root = mcp._root(record, state)
                    self.assertGreater(len(str(package_root)), 300)
                    io_path(package_root).mkdir(parents=True)
                    io_path(package_root / ".npmrc").write_text("registry=https://target.invalid/\n")
                    mcp.install(record, state, guard=safe_file)
                    self.assertEqual(json.loads(io_path(package_root / "package.json").read_bytes()),
                                     record["recipe"]["package_json"])
                    self.assertEqual(json.loads(io_path(package_root / "package-lock.json").read_bytes()),
                                     record["recipe"]["package_lock"])
                    self.assertTrue(io_path(package_root / "node_modules/JSONStream/index.js").is_file())
                    self.assertFalse((root / "node_modules").exists())
                    command, _ = mcp._npm_tools()
                    outputs = []
                    execute = mcp._run

                    def capture(command, **kwargs):
                        result = execute(command, **kwargs)
                        outputs.append(result)
                        return result

                    with patch.object(mcp, "_run", side_effect=capture):
                        mcp._npm(command, ["config", "get", "registry"], package_root,
                                 state / "tools/mcp-cache/npm")
                    self.assertEqual(outputs[-1].strip(), "https://target.invalid/")
                    config = mcp.configuration(record, state, node=shutil.which("node"))
                    self.assertEqual(initialize(config)["result"]["serverInfo"]["name"], "npm-closure")
                    self.assertEqual(mcp.missing(record, state, guard=safe_file), [])
                    receipt = io_path(package_root / "receipt.json")
                    before = (receipt.read_bytes(), receipt.stat().st_mtime_ns)
                    with patch.object(mcp, "_npm", side_effect=AssertionError("healthy receipt reinstalled")):
                        mcp.install(record, state, guard=safe_file)
                    self.assertEqual((receipt.read_bytes(), receipt.stat().st_mtime_ns), before)
                    self.assertEqual(record, original)
            finally:
                shutil.rmtree(io_path(root))

    @unittest.skipUnless(os.name == "nt", "Windows long-path I/O")
    def test_tree_reads_long_files_with_logical_guards_and_relative_inventory(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            root = state / ("state [client] & 한글 " + "x" * 90)
            path = root / ("nested-" + "y" * 90) / ("z" * 50 + ".map")
            self.assertGreater(len(str(path)), 260)
            io_path(path.parent).mkdir(parents=True)
            io_path(path).write_bytes(b"real long file")
            io_path(root / "receipt.json").write_bytes(b"excluded receipt")
            io_path(path.with_suffix(".pyc")).write_bytes(b"sourceless bytecode")
            io_path(root / "__pycache__").mkdir()
            io_path(root / "__pycache__/fixture.pyc").write_bytes(b"excluded bytecode")
            guarded = []

            def guard(candidate, boundary):
                self.assertEqual(boundary, state)
                self.assertFalse(str(candidate).startswith("\\\\?\\"))
                self.assertTrue(candidate.is_relative_to(boundary))
                guarded.append(candidate)
                safe_file(candidate, boundary)

            try:
                files = mcp._tree(root, state, guard)
                self.assertEqual(files, {path.relative_to(root).as_posix(): mcp._sha(b"real long file"),
                                         path.with_suffix(".pyc").relative_to(root).as_posix():
                                             mcp._sha(b"sourceless bytecode")})
                self.assertIn(path, guarded)
            finally:
                shutil.rmtree(io_path(state))

    @unittest.skipUnless(os.name == "nt", "Windows long-path I/O")
    def test_real_wheel_replay_at_long_final_path_and_long_cached_wheels(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / ("state [client] & 한글 " + "x" * 100)
            guards = []

            def guard(candidate, boundary):
                self.assertEqual(boundary, state)
                self.assertFalse(str(candidate).startswith("\\\\?\\"))
                self.assertTrue(candidate.is_relative_to(boundary))
                guards.append(candidate)
                safe_file(candidate, boundary)

            try:
                with python_fixture(root):
                    record = mcp.resolve(spec("python"))
                    self.assertNotIn(str(root), json.dumps(record, ensure_ascii=False))
                    package_root = mcp._root(record, state)
                    cached = package_root / "wheels" / record["recipe"]["wheels"][0]["filename"]
                    self.assertGreater(len(str(cached)), 260)
                    io_path(cached.parent).mkdir(parents=True)
                    io_path(cached).write_bytes(b"corrupt cache")
                    mcp.install(record, state, guard=guard)
                    config = mcp.configuration(record, state)
                    self.assertGreater(len(config["command"]), 260)
                    reply = initialize(config)
                    self.assertEqual(reply["result"]["serverInfo"]["name"], "wheel-closure")
                    self.assertEqual(io_path(Path(reply["result"]["prefix"])), io_path(package_root / "venv"))
                    self.assertEqual(mcp.missing(record, state, guard=guard), [])
                    with patch.object(mcp, "_fetch", side_effect=AssertionError("healthy install fetched")), \
                            patch.object(mcp.venv, "EnvBuilder") as builder:
                        mcp.install(record, state, guard=guard)
                        builder.assert_not_called()
                    io_path(cached).write_bytes(b"corrupt again")
                    self.assertTrue(mcp.missing(record, state, guard=guard))
                    mcp.install(record, state, guard=guard)
                    self.assertEqual(initialize(config)["result"]["serverInfo"]["name"], "wheel-closure")
                    self.assertEqual(mcp.missing(record, state, guard=guard), [])
                    self.assertIn(cached, guards)
            finally:
                shutil.rmtree(io_path(root))

    def test_real_wheel_added_package_shadow_is_detected(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "state"
            with python_fixture(root):
                record = mcp.resolve(spec("python"))
                mcp.install(record, state, guard=safe_file)
                config = mcp.configuration(record, state)
                environment = mcp._root(record, state) / "venv"
                site = next(io_path(environment).rglob("fixture_dep.py")).parent
                shadow = site / "fixture_dep/__init__.py"
                shadow.parent.mkdir()
                shadow.write_text("VALUE = 'added-package-shadow'\n")
                self.assertEqual(initialize(config)["result"]["serverInfo"]["name"], "added-package-shadow")
                self.assertTrue(mcp.missing(record, state, guard=safe_file), "extra runtime file was accepted")

    def test_real_wheel_repair_removes_shadow_instead_of_blessing_it(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "state"
            outside = root / "outside.txt"
            outside.write_bytes(b"preserve outside managed state")
            with python_fixture(root):
                record = mcp.resolve(spec("python"))
                mcp.install(record, state, guard=safe_file)
                config = mcp.configuration(record, state)
                package_root = mcp._root(record, state)
                module = next(io_path(package_root / "venv").rglob("fixture_dep.py"))
                shadow = module.parent / "fixture_dep/__init__.py"
                shadow.parent.mkdir()
                shadow.write_text("VALUE = 'added-package-shadow'\n")
                for mutate_recorded in (False, True):
                    with self.subTest(mutate_recorded=mutate_recorded):
                        if mutate_recorded:
                            shadow.parent.mkdir(exist_ok=True)
                            shadow.write_text("VALUE = 'added-package-shadow'\n")
                            module.write_text("VALUE = 'recorded-tamper'\n")
                        with patch.object(mcp, "_fetch", side_effect=AssertionError("verified wheels were discarded")):
                            mcp.install(record, state, guard=safe_file)
                        self.assertEqual(initialize(config)["result"]["serverInfo"]["name"], "wheel-closure")
                        self.assertFalse(shadow.exists())
                        receipt = json.loads(io_path(package_root / "receipt.json").read_bytes())
                        self.assertFalse(any(name.endswith("fixture_dep/__init__.py") for name in receipt["files"]))
                        self.assertEqual(mcp.missing(record, state, guard=safe_file), [])
                        self.assertEqual(outside.read_bytes(), b"preserve outside managed state")

    @unittest.skipUnless(os.name == "nt", "Windows junction guard")
    def test_repair_refuses_venv_junctions_before_recursive_removal(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "state"
            outside = root / "outside"
            outside.mkdir()
            sentinel = outside / "keep.txt"
            sentinel.write_bytes(b"outside managed state")
            with python_fixture(root):
                record = mcp.resolve(spec("python"))
                environment = mcp._root(record, state) / "venv"
                for nested in (False, True):
                    with self.subTest(nested=nested):
                        junction = environment / "Lib/injected" if nested else environment
                        io_path(junction.parent).mkdir(parents=True, exist_ok=True)
                        subprocess.run(["cmd.exe", "/c", "mklink", "/J", str(junction), str(outside)],
                                       check=True, capture_output=True)
                        try:
                            with patch.object(mcp.shutil, "rmtree") as remove:
                                with self.assertRaisesRegex(HarnessError, "would follow a link"):
                                    mcp.install(record, state, guard=safe_file)
                                remove.assert_not_called()
                            self.assertEqual(sentinel.read_bytes(), b"outside managed state")
                        finally:
                            io_path(junction).rmdir()

    @unittest.skipUnless(shutil.which("node") and shutil.which("npm"), "Node and npm are required")
    def test_real_npm_legacy_uppercase_transitive_dependency_replays(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "state [client] & 한글"
            with npm_fixture(root, dependency_name="JSONStream"):
                record = mcp.resolve(spec("npm"))
                self.assertIn("node_modules/JSONStream", record["recipe"]["package_lock"]["packages"])
                mcp.preflight(record)
                mcp.install(record, state, guard=safe_file)
                config = mcp.configuration(record, state, node=shutil.which("node"))
                self.assertEqual(initialize(config)["result"]["serverInfo"]["name"], "npm-closure")
                self.assertEqual(mcp.missing(record, state, guard=safe_file), [])
                for name in ("../escape", "@scope/../escape", "bad\\name", "C:escape"):
                    bad = copy.deepcopy(record)
                    bad["recipe"]["package_lock"]["packages"]["node_modules/fixture-mcp"]["dependencies"] = {name: "1.0.0"}
                    with self.subTest(unsafe_dependency=name), self.assertRaisesRegex(ValueError, "Invalid npm dependency name"):
                        mcp.preflight(bad)

    def test_http_record_and_configuration_are_pure_and_only_copy_token_names(self):
        declaration = {"name": "remote", "kind": "http", "url": "https://mcp.invalid/서비스",
                       "bearer_token_env_var": "FIXTURE_TOKEN"}
        with TemporaryDirectory() as directory, patch.dict(os.environ, {"FIXTURE_TOKEN": "private-value"}), \
                patch.object(mcp, "_fetch") as fetch, patch.object(mcp, "_run") as execute:
            state = Path(directory) / "not-created"
            record = mcp.resolve(declaration)
            self.assertEqual(set(record), {"name", "kind", "declaration", "declaration_sha256", "recipe"})
            expected = hashlib.sha256(json.dumps(declaration, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
            self.assertEqual(record["declaration_sha256"], expected)
            self.assertEqual(mcp.configuration(record, state), {"url": declaration["url"], "bearer_token_env_var": "FIXTURE_TOKEN"})
            self.assertIsNone(mcp.preflight(record))
            mcp.install(record, state, guard=safe_file)
            self.assertEqual(mcp.missing(record, state, guard=safe_file), [])
            self.assertFalse(state.exists())
            self.assertNotIn("private-value", json.dumps(record))
            fetch.assert_not_called()
            execute.assert_not_called()
            declaration["name"] = "changed"
            self.assertEqual(record["declaration"]["name"], "remote")

    @unittest.skipUnless(shutil.which("node") and shutil.which("npm"), "Node and npm are required")
    def test_real_npm_closure_replay_initialize_tamper_repair_and_determinism(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "state space & 한글"
            declaration = spec("npm")
            declaration["version"] = "latest"
            declaration["args"] = ["space & 한글"]
            with npm_fixture(root):
                record = mcp.resolve(declaration)
                self.assertEqual(record, mcp.resolve(declaration))
                self.assertEqual(len(record["recipe"]["package_lock"]["packages"]), 3)
                self.assertNotIn(str(root), json.dumps(record))
                self.assertTrue(mcp.missing(record, state, guard=safe_file))
                mcp.install(record, state, guard=safe_file)
                config = mcp.configuration(record, state, node=shutil.which("node"))
                self.assertEqual(config["command"], shutil.which("node"))
                self.assertIn(str(state / "tools/mcp"), config["args"][0])
                reply = initialize(config)
                self.assertEqual(reply["id"], 7)
                self.assertEqual(reply["result"]["serverInfo"]["name"], "npm-closure")
                self.assertEqual(reply["result"]["args"], ["space & 한글"])
                self.assertEqual(mcp.missing(record, state, guard=safe_file), [])
                with patch.object(mcp, "_npm") as npm:
                    mcp.install(record, state, guard=safe_file)
                    npm.assert_not_called()
                dependency = Path(config["args"][0]).parent.parent / "fixture-dep/index.js"
                dependency.write_text("module.exports='tampered';")
                self.assertTrue(mcp.missing(record, state, guard=safe_file))
                mcp.install(record, state, guard=safe_file)
                self.assertEqual(initialize(config)["result"]["serverInfo"]["name"], "npm-closure")

    @unittest.skipUnless(shutil.which("node") and shutil.which("npm"), "Node and npm are required")
    def test_real_npm_rejects_engine_incompatible_package(self):
        with TemporaryDirectory() as directory, npm_fixture(Path(directory), engine=">=999"), \
                patch.dict(os.environ, {"NPM_CONFIG_FORCE": "true"}):
            with self.assertRaisesRegex(ValueError, "npm engine requirements"):
                mcp.resolve(spec("npm"))

    @unittest.skipUnless(shutil.which("node") and shutil.which("npm"), "Node and npm are required")
    def test_real_npm_rejects_corrupt_dependency_artifact_without_receipt(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "state"
            with npm_fixture(root):
                record = mcp.resolve(spec("npm"))
                checksum = record["recipe"]["package_lock"]["packages"]["node_modules/fixture-dep"]["integrity"]
                digest = base64.b64decode(checksum.split("-", 1)[1]).hex()
                artifact = root / "seed cache/_cacache/content-v2/sha512" / digest[:2] / digest[2:4] / digest[4:]
                artifact.write_bytes(b"corrupt dependency")
                with self.assertRaisesRegex(ValueError, "package command failed"):
                    mcp.install(record, state, guard=safe_file)
                self.assertTrue(mcp.missing(record, state, guard=safe_file))
                self.assertEqual(list(state.rglob("receipt.json")), [])

    def test_real_wheel_closure_installs_final_venv_console_script_and_initializes(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "state space & 한글"
            before = subprocess.run([sys.executable, "-m", "pip", "list", "--format=json", "--disable-pip-version-check"],
                                    check=True, capture_output=True).stdout
            with python_fixture(root):
                record = mcp.resolve(spec("python"))
                self.assertEqual(len(record["recipe"]["wheels"]), 2)
                self.assertNotIn(str(root), json.dumps(record))
                self.assertNotIn(sys.executable, json.dumps(record))
                mcp.install(record, state, guard=safe_file)
                config = mcp.configuration(record, state)
                self.assertIn(str(state / "tools/mcp"), config["command"])
                self.assertNotEqual(config["command"], sys.executable)
                reply = initialize(config)
                self.assertEqual(reply["result"]["serverInfo"]["name"], "wheel-closure")
                self.assertEqual(Path(reply["result"]["prefix"]), Path(config["command"]).parent.parent)
                self.assertEqual(mcp.missing(record, state, guard=safe_file), [])
                with patch.object(mcp, "_fetch") as fetch, patch.object(mcp, "venv") as venv:
                    mcp.install(record, state, guard=safe_file)
                    fetch.assert_not_called()
                    venv.EnvBuilder.assert_not_called()
                executable = Path(config["command"])
                executable.unlink()
                self.assertTrue(mcp.missing(record, state, guard=safe_file))
                mcp.install(record, state, guard=safe_file)
                self.assertEqual(initialize(config)["result"]["serverInfo"]["name"], "wheel-closure")
            after = subprocess.run([sys.executable, "-m", "pip", "list", "--format=json", "--disable-pip-version-check"],
                                   check=True, capture_output=True).stdout
            self.assertEqual(before, after)

    def test_real_pip_rejects_requires_python_incompatible_package(self):
        with TemporaryDirectory() as directory, python_fixture(Path(directory), python=">=999"):
            with self.assertRaisesRegex(ValueError, "compatible wheels and matching Requires-Python"):
                mcp.resolve(spec("python"))

    def test_real_pip_replay_ignores_ambient_destinations_and_preserves_environment(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with python_fixture(root):
                record = mcp.resolve(spec("python"))
                config_file = root / "pip.ini"
                cases = ["PIP_TARGET", "PIP_PREFIX", "PIP_ROOT", "PIP_USER", "PIP_CONFIG_FILE",
                         "PYTHONUSERBASE", "PYTHONHOME"]
                for index, variable in enumerate(cases):
                    outside = root / f"outside-{index}"
                    config_file.write_text(f"[global]\ntarget = {outside}\n[install]\nuser = true\n")
                    environment = {variable: str(outside)}
                    if variable == "PIP_USER":
                        environment[variable] = "true"
                    elif variable == "PIP_CONFIG_FILE":
                        environment[variable] = str(config_file)
                    elif variable == "PYTHONUSERBASE":
                        environment["PYTHONPATH"] = str(outside)
                    with self.subTest(destination=variable), patch.dict(os.environ, environment):
                        state = root / f"state-{index}"
                        before = os.environ.copy()
                        error = None
                        try:
                            mcp.install(record, state, guard=safe_file)
                        except ValueError as caught:
                            error = caught
                        self.assertFalse(outside.exists(), "pip wrote outside the selected state")
                        self.assertIsNone(error, str(error))
                        self.assertTrue(dict(os.environ) == before, "MCP install mutated the process environment")
                        with patch.dict(os.environ, {}, clear=True):
                            self.assertEqual(initialize(mcp.configuration(record, state))["result"]["serverInfo"]["name"],
                                             "wheel-closure")

    def test_preflight_and_configuration_reject_incomplete_recipe_before_mutation(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "not-created"
            with python_fixture(root):
                record = mcp.resolve(spec("python"))
            bad_records = []
            bad = copy.deepcopy(record)
            bad["recipe"].pop("wheels")
            bad_records.append(bad)
            bad = copy.deepcopy(record)
            bad["recipe"]["wheels"] = [item for item in bad["recipe"]["wheels"] if item["name"] == "fixture-mcp"]
            bad_records.append(bad)
            bad = copy.deepcopy(record)
            bad["recipe"].pop("target")
            bad_records.append(bad)
            for field, value in (("wheels", []), ("entrypoint", "invalid"), ("console_script", "../outside")):
                bad = copy.deepcopy(record)
                bad["recipe"][field] = value
                bad_records.append(bad)
            for field, value in (("filename", "../outside.whl"), ("sha256", "broken"),
                                 ("url", "https://user:private-value@wheels.invalid/file.whl"),
                                 ("requires_python", ">=999"), ("tags", ["cp999-none-any"]),
                                 ("requires_dist", ["fixture-absent==1.0.0"]), ("version", "2.0.0")):
                bad = copy.deepcopy(record)
                bad["recipe"]["wheels"][-1][field] = value
                bad_records.append(bad)
            bad = copy.deepcopy(record)
            bad["recipe"]["wheels"].append(copy.deepcopy(bad["recipe"]["wheels"][0]))
            bad_records.append(bad)
            for field, value in (("declaration_sha256", "broken"), ("name", "different"), ("kind", "other")):
                bad = copy.deepcopy(record)
                bad[field] = value
                bad_records.append(bad)
            for bad in bad_records:
                with self.subTest(recipe=list(bad["recipe"])), patch.object(mcp, "_fetch") as fetch, \
                        patch.object(mcp, "_run") as execute:
                    with self.assertRaises(ValueError) as caught:
                        mcp.configuration(bad, state)
                    self.assertNotIn("private-value", str(caught.exception))
                    with self.assertRaises(ValueError):
                        mcp.preflight(bad)
                    execute.assert_not_called()
                    fetch.assert_not_called()
                    self.assertFalse(state.exists())

    def test_python_preflight_is_read_only_and_configuration_does_not_probe_runtime(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "not-created"
            with python_fixture(root):
                record = mcp.resolve(spec("python"))
            before = copy.deepcopy(record)
            with patch.object(mcp, "_fetch") as fetch, patch.object(mcp, "venv") as environments, \
                    patch.object(mcp.Path, "write_bytes", side_effect=AssertionError("preflight wrote a file")), \
                    patch.object(mcp.Path, "mkdir", side_effect=AssertionError("preflight created a directory")):
                self.assertIsNone(mcp.preflight(record))
                fetch.assert_not_called()
                environments.EnvBuilder.assert_not_called()
                with patch.object(mcp, "_run") as execute:
                    mcp.configuration(record, state)
                    execute.assert_not_called()
            self.assertEqual(record, before)
            self.assertFalse(state.exists())

    def test_real_pip_replay_ignores_target_site_configuration(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            outside = root / "outside"
            state = root / "state"
            create = mcp.venv.EnvBuilder.create

            def configured_environment(builder, path):
                create(builder, path)
                config = Path(path) / ("pip.ini" if os.name == "nt" else "pip.conf")
                config.write_text(f"[install]\ntarget = {outside}\n")

            with python_fixture(root):
                record = mcp.resolve(spec("python"))
                with patch.object(mcp.venv.EnvBuilder, "create", new=configured_environment):
                    mcp.install(record, state, guard=safe_file)
                self.assertFalse(outside.exists())
                self.assertEqual(initialize(mcp.configuration(record, state))["result"]["serverInfo"]["name"], "wheel-closure")

    def test_real_pip_resolution_still_reads_local_package_manager_configuration(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            constraints = root / "constraints.txt"
            constraints.write_text("fixture-dep==999.0.0\n")
            config = root / "pip.ini"
            config.write_text(f"[install]\nconstraint = {constraints}\n")
            with python_fixture(root), patch.dict(os.environ, {"PIP_CONFIG_FILE": str(config)}):
                with self.assertRaisesRegex(ValueError, "compatible wheels and matching Requires-Python"):
                    mcp.resolve(spec("python"))

    @unittest.skipUnless(shutil.which("node") and shutil.which("npm"), "Node and npm are required")
    def test_real_npm_preflight_rejects_broken_closure_and_current_runtime_mismatch(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "not-created"
            with npm_fixture(root):
                record = mcp.resolve(spec("npm"))
            with patch.object(mcp, "_npm") as npm, patch.object(mcp, "_fetch") as fetch:
                self.assertIsNone(mcp.preflight(record))
                npm.assert_not_called()
                fetch.assert_not_called()
            bad_records = []
            for path, field, value in (("", "dependencies", {}),
                                       ("node_modules/fixture-dep", "integrity", "sha512-YWJj"),
                                       ("node_modules/fixture-dep", "resolved", "file:local.tgz")):
                bad = copy.deepcopy(record)
                bad["recipe"]["package_lock"]["packages"][path][field] = value
                bad_records.append(bad)
            bad = copy.deepcopy(record)
            del bad["recipe"]["package_lock"]["packages"]["node_modules/fixture-dep"]
            bad_records.append(bad)
            for field, value in (("bin", "node_modules/other/cli.js"), ("bin_sha256", "broken"), ("target", {})):
                bad = copy.deepcopy(record)
                bad["recipe"][field] = value
                bad_records.append(bad)
            for bad in bad_records:
                with self.subTest(recipe=list(bad["recipe"])), patch.object(mcp, "_run") as execute:
                    with self.assertRaises(ValueError):
                        mcp.configuration(bad, state)
                    with self.assertRaises(ValueError):
                        mcp.preflight(bad)
                    execute.assert_not_called()
            record["recipe"]["target"]["node"] = "0.0.0"
            mcp.configuration(record, state)
            with self.assertRaisesRegex(ValueError, "target context changed"):
                mcp.preflight(record)
            self.assertFalse(state.exists())

    def test_corrupt_cached_wheel_is_refetched_verified_and_repaired(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "state"
            with python_fixture(root) as artifacts:
                record = mcp.resolve(spec("python"))
                cached = mcp._root(record, state) / "wheels" / record["recipe"]["wheels"][0]["filename"]
                cached.parent.mkdir(parents=True)
                cached.write_bytes(b"corrupt cached wheel")
                with patch.object(mcp, "_fetch", return_value=b"corrupt download"):
                    with self.assertRaisesRegex(ValueError, "wheel SHA256 mismatch"):
                        mcp.install(record, state, guard=safe_file)
                self.assertEqual(cached.read_bytes(), b"corrupt cached wheel")
                self.assertEqual(list(state.rglob("receipt.json")), [])
                mcp.install(record, state, guard=safe_file)
                self.assertEqual(cached.read_bytes(), artifacts[cached.name])
                self.assertEqual(initialize(mcp.configuration(record, state))["result"]["serverInfo"]["name"], "wheel-closure")
                self.assertEqual(mcp.missing(record, state, guard=safe_file), [])
                self.assertEqual(list(cached.parent.glob(".wheel-*")), [])

    def test_wheel_hash_failure_does_not_publish_receipt_or_create_environment(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "state"
            with python_fixture(root):
                record = mcp.resolve(spec("python"))
                with patch.object(mcp, "_fetch", return_value=b"changed-wheel"), \
                        patch.object(mcp, "venv") as venv:
                    with self.assertRaisesRegex(ValueError, "wheel SHA256 mismatch"):
                        mcp.install(record, state, guard=safe_file)
                    venv.EnvBuilder.assert_not_called()
                self.assertTrue(mcp.missing(record, state, guard=safe_file))
                self.assertEqual(list(state.rglob("receipt.json")), [])

    def test_missing_rejects_receipt_with_wrong_recipe_or_missing_launch_inventory(self):
        record = {"name": "fixture", "kind": "python", "declaration": spec("python"),
                  "recipe": {"console_script": "fixture-mcp"}}
        with TemporaryDirectory() as directory:
            state = Path(directory)
            root = mcp._root(record, state)
            root.mkdir(parents=True)
            receipt = root / "receipt.json"
            receipt.write_bytes(mcp._json({"record_sha256": "wrong", "files": {"unused": "wrong"}}))
            self.assertIn("does not match", mcp.missing(record, state, guard=safe_file)[0])
            receipt.write_bytes(mcp._json({"record_sha256": mcp._sha(mcp._json(record)), "files": {"unused": "wrong"}}))
            self.assertIn("launch file", mcp.missing(record, state, guard=safe_file)[0])

    def test_npm_lock_rejects_missing_closure_integrity_and_credentials(self):
        selected = {"version": "1.0.0", "resolved": "https://npm.invalid/fixture.tgz", "integrity": "sha512-YWJj"}
        lock = {"lockfileVersion": 3, "packages": {"node_modules/fixture-mcp": selected}}
        self.assertEqual(mcp._npm_lock(lock, "fixture-mcp"), selected)
        bad = copy.deepcopy(lock)
        bad["packages"]["node_modules/dependency"] = {"version": "1.0.0", "resolved": "https://npm.invalid/dependency.tgz"}
        with self.assertRaisesRegex(ValueError, "integrity"):
            mcp._npm_lock(bad, "fixture-mcp")
        bad = copy.deepcopy(lock)
        bad["packages"]["node_modules/fixture-mcp"]["resolved"] = "https://user:secret-value@npm.invalid/fixture.tgz"
        with self.assertRaises(ValueError) as caught:
            mcp._npm_lock(bad, "fixture-mcp")
        self.assertNotIn("secret-value", str(caught.exception))

    def test_wheel_source_incompatible_and_traversal_artifacts_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "require wheels"):
            mcp._wheel(b"source", "fixture.tar.gz", {"tags": []})
        filename, data = wheel("fixture", {"fixture.py": b""}, tag="cp999-none-any")
        with self.assertRaisesRegex(ValueError, "incompatible"):
            mcp._wheel(data, filename, {"tags": ["py3-none-any"]})
        filename, data = wheel("fixture", {"../outside.py": b""})
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            mcp._wheel(data, filename, {"tags": ["py3-none-any"]})

    def test_package_manager_failures_do_not_echo_credentials(self):
        error = subprocess.CalledProcessError(1, ["tool", "secret-token"], output="secret-token", stderr="secret-token")
        with patch.object(mcp.subprocess, "run", side_effect=error):
            with self.assertRaises(ValueError) as caught:
                mcp._run(["tool", "secret-token"])
            self.assertNotIn("secret-token", str(caught.exception))
            self.assertTrue(caught.exception.__suppress_context__)
        with self.assertRaises(ValueError) as caught:
            mcp._url("https://user:secret-token@package.invalid/file.whl")
        self.assertNotIn("secret-token", str(caught.exception))

    def test_context_mismatch_fails_before_state_mutation(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with python_fixture(root):
                record = mcp.resolve(spec("python"))
            record["recipe"]["target"]["platform"] = "different-platform"
            state = root / "not-created"
            mcp.configuration(record, state)
            with self.assertRaisesRegex(ValueError, "target context changed"):
                mcp.preflight(record)
            with self.assertRaisesRegex(ValueError, "target context changed"):
                mcp.install(record, state, guard=safe_file)
            self.assertFalse(state.exists())

    def test_guard_is_used_before_managed_reads_and_writes(self):
        def reject(path, state):
            raise RuntimeError("fixture path guard refused")
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with python_fixture(root):
                record = mcp.resolve(spec("python"))
            state = root / "not-created"
            with self.assertRaisesRegex(RuntimeError, "path guard refused"):
                mcp.install(record, state, guard=reject)
            with self.assertRaisesRegex(RuntimeError, "path guard refused"):
                mcp.missing(record, state, guard=reject)
            self.assertFalse(state.exists())


if __name__ == "__main__":
    unittest.main()
