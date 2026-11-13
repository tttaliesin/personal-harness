from __future__ import annotations

import base64
import configparser
import copy
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
import venv
import zipfile

import registry


def _json(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def _sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _run(command, *, cwd=None, env=None) -> str:
    try:
        return subprocess.run(command, cwd=cwd, env=env, check=True, capture_output=True,
                              text=True, encoding="utf-8", errors="replace").stdout
    except subprocess.CalledProcessError as error:
        if "EBADENGINE" in (error.stderr or ""):
            raise ValueError("npm engine requirements do not support this Node/npm runtime") from None
        raise ValueError("MCP package command failed; check package compatibility and package-manager configuration") from None
    except OSError:
        raise ValueError("MCP package command failed; check package compatibility and package-manager configuration") from None


def _url(value: str) -> str:
    parsed = urllib.parse.urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username is not None
            or parsed.password is not None or parsed.query or parsed.fragment):
        raise ValueError("Package artifact requires an HTTPS URL without credentials or query parameters")
    return value


def _fetch(url: str) -> bytes:
    _url(url)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "personal-harness"}),
                                    timeout=60) as response:
            _url(response.url)
            return response.read()
    except (OSError, ValueError):
        raise ValueError("Unable to download MCP package artifact") from None


def _relative(value: str) -> str:
    if not isinstance(value, str) or any(ord(char) < 32 for char in value):
        raise ValueError("Unsafe package artifact path")
    path = PurePosixPath(value)
    if (not value or path.is_absolute() or "\\" in value or ":" in value
            or any(part in ("", ".", "..") for part in value.split("/"))):
        raise ValueError("Unsafe package artifact path")
    return path.as_posix()


def _npm_tools() -> tuple[list[str], dict]:
    node = shutil.which("node")
    npm = shutil.which("npm")
    if not node or not npm:
        raise ValueError("Node and npm are required for npm MCP packages")
    candidates = [Path(npm).parent / "node_modules/npm/bin/npm-cli.js",
                  Path(node).parent / "node_modules/npm/bin/npm-cli.js",
                  Path(node).parent.parent / "lib/node_modules/npm/bin/npm-cli.js"]
    cli = next((path for path in candidates if path.is_file()), None)
    if cli is None:
        raise ValueError("Cannot locate npm's JavaScript CLI beside Node or npm")
    command = [node, str(cli)]
    context = json.loads(_run([node, "-p", "JSON.stringify({node:process.versions.node,platform:process.platform,arch:process.arch})"]))
    context["npm"] = _run([*command, "--version"]).strip()
    return command, context


def _npm(command, arguments, directory: Path, cache: Path):
    environment = os.environ.copy()
    environment["NPM_CONFIG_CACHE"] = str(cache)
    _run([*command, *arguments, "--ignore-scripts", "--engine-strict", "--force=false", "--bin-links=false",
          "--include=optional", "--include=peer", "--include=prod",
          "--no-audit", "--no-fund", "--cache", str(cache)], cwd=directory, env=environment)


def _npm_lock(lock: dict, package: str) -> dict:
    if lock.get("lockfileVersion") != 3 or "packages" not in lock:
        raise ValueError("npm must provide a complete v3 package lock")
    for name, metadata in lock["packages"].items():
        if not name:
            continue
        _relative(name)
        if not name.startswith("node_modules/") or metadata.get("link"):
            raise ValueError("npm lock contains a non-registry dependency")
        if metadata.get("inBundle"):
            parent = name.rsplit("/node_modules/", 1)[0]
            if parent == name or not lock["packages"].get(parent):
                raise ValueError("Bundled npm dependency has no recorded parent artifact")
            continue
        _url(metadata.get("resolved", ""))
        if not re.fullmatch(r"sha(?:512|256|1)-[A-Za-z0-9+/]+={0,2}", metadata.get("integrity", "")):
            raise ValueError("npm dependency is missing artifact integrity")
    selected = lock["packages"].get(f"node_modules/{package}")
    if not selected or not isinstance(selected.get("version"), str):
        raise ValueError("Selected npm package is absent from its dependency lock")
    return selected


def _npm_bin(manifest: dict, entrypoint: str) -> str:
    bins = manifest.get("bin", {})
    if isinstance(bins, str):
        bins = {manifest["name"].split("/")[-1]: bins}
    if not isinstance(bins, dict) or entrypoint not in bins or not isinstance(bins[entrypoint], str):
        raise ValueError("Requested npm entrypoint is not a declared package bin")
    target = bins[entrypoint]
    if target.startswith("./"):
        target = target[2:]
    return _relative(target)


def _resolve_npm(spec: dict) -> dict:
    command, context = _npm_tools()
    package_json = {"name": "personal-harness-mcp", "version": "1.0.0", "private": True,
                    "dependencies": {spec["package"]: spec["version"]}}
    with tempfile.TemporaryDirectory(prefix="harness-mcp-npm-") as temporary:
        root = Path(temporary)
        (root / "package.json").write_bytes(_json(package_json))
        _npm(command, ["install", "--package-lock-only"], root, root / "cache")
        lock = json.loads((root / "package-lock.json").read_bytes())
        selected = _npm_lock(lock, spec["package"])
        if spec["version"] != "latest" and selected["version"] != spec["version"]:
            raise ValueError("npm resolved a version different from the exact registration")
        _npm(command, ["ci"], root, root / "cache")
        package_root = root / "node_modules" / spec["package"]
        manifest = json.loads((package_root / "package.json").read_bytes())
        if manifest.get("name") != spec["package"] or manifest.get("version") != selected["version"]:
            raise ValueError("npm package identity does not match its lock")
        target = _npm_bin(manifest, spec["entrypoint"])
        executable = package_root / target
        if not executable.is_file() or executable.is_symlink():
            raise ValueError("npm bin target is missing or linked")
        return {"target": context, "package_json": package_json, "package_lock": lock,
                "version": selected["version"], "bin": f"node_modules/{spec['package']}/{target}",
                "bin_sha256": _sha(executable.read_bytes())}


def _python_context() -> dict:
    script = ("import json,sys,sysconfig; from pip._vendor.packaging.tags import sys_tags; "
              "from pip._vendor.packaging.markers import default_environment; "
              "print(json.dumps({'implementation':sys.implementation.name,'version':list(sys.version_info[:3]),"
              "'platform':sysconfig.get_platform(),'tags':[str(t) for t in sys_tags()],"
              "'markers':default_environment()}))")
    return json.loads(_run([sys.executable, "-I", "-B", "-c", script], env=_replay_environment()))


def _replay_environment() -> dict[str, str]:
    environment = {key: value for key, value in os.environ.items()
                   if not key.upper().startswith(("PIP_", "PYTHON", "_PYTHON"))
                   and key.upper() not in {"__PYVENV_LAUNCHER__", "VIRTUAL_ENV"}}
    environment["PIP_CONFIG_FILE"] = os.devnull
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    return environment


def _distribution(value: str) -> str:
    return re.sub(r"[-_.]+", "-", value).lower()


def _wheel(data: bytes, filename: str, target: dict) -> tuple[dict, dict]:
    _relative(filename)
    if not filename.endswith(".whl") or "/" in filename:
        raise ValueError("Python MCP recipes require wheels, not source distributions")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for name in archive.namelist():
                _relative(name.rstrip("/"))
            wheel_names = [name for name in archive.namelist() if name.endswith(".dist-info/WHEEL")]
            metadata_names = [name for name in archive.namelist() if name.endswith(".dist-info/METADATA")]
            if len(wheel_names) != 1 or len(metadata_names) != 1:
                raise ValueError("Wheel must contain one distribution")
            from email.parser import BytesParser
            wheel_metadata = BytesParser().parsebytes(archive.read(wheel_names[0]))
            tags = []
            for tag in wheel_metadata.get_all("Tag", []):
                interpreter, abi, platform = tag.split("-")
                tags.extend(f"{i}-{a}-{p}" for i in interpreter.split(".")
                            for a in abi.split(".") for p in platform.split("."))
            if not set(tags).intersection(target["tags"]):
                raise ValueError("Wheel is incompatible with the selected Python target")
            metadata = BytesParser().parsebytes(archive.read(metadata_names[0]))
            entries = {}
            entry_file = metadata_names[0].rsplit("/", 1)[0] + "/entry_points.txt"
            if entry_file in archive.namelist():
                parser = configparser.ConfigParser(interpolation=None)
                parser.optionxform = str
                parser.read_string(archive.read(entry_file).decode())
                if parser.has_section("console_scripts"):
                    entries = dict(parser.items("console_scripts"))
            if not metadata["Name"] or not metadata["Version"]:
                raise ValueError("Wheel distribution identity is missing")
            return {"name": metadata["Name"], "version": metadata["Version"],
                    "requires_dist": metadata.get_all("Requires-Dist", []),
                    "requires_python": metadata.get("Requires-Python", ""), "tags": sorted(set(tags))}, entries
    except (zipfile.BadZipFile, KeyError, TypeError, UnicodeError, configparser.Error):
        raise ValueError("Invalid Python wheel metadata") from None


def _resolve_python(spec: dict) -> dict:
    target = _python_context()
    requirement = spec["package"] + ("" if spec["version"] == "latest" else f"=={spec['version']}")
    with tempfile.TemporaryDirectory(prefix="harness-mcp-python-") as temporary:
        root = Path(temporary)
        report_path = root / "report.json"
        try:
            _run([sys.executable, "-m", "pip", "--disable-pip-version-check", "--cache-dir", str(root / "cache"),
                  "install", "--dry-run", "--ignore-installed", "--only-binary=:all:", "--report", str(report_path), requirement])
        except ValueError:
            raise ValueError("Python MCP resolution requires compatible wheels and matching Requires-Python; check package-manager configuration") from None
        report = json.loads(report_path.read_bytes())
        wheels = []
        entry = None
        selected_version = None
        for item in report["install"]:
            download = item["download_info"]
            url = _url(download["url"])
            filename = urllib.parse.unquote(urllib.parse.urlsplit(url).path.rsplit("/", 1)[-1])
            expected = download.get("archive_info", {}).get("hashes", {}).get("sha256", "")
            if not re.fullmatch(r"[0-9a-f]{64}", expected):
                raise ValueError("Python wheel is missing SHA256 integrity")
            data = _fetch(url)
            if _sha(data) != expected:
                raise ValueError("Python wheel SHA256 mismatch")
            identity, entries = _wheel(data, filename, target)
            metadata = item["metadata"]
            if (_distribution(identity["name"]) != _distribution(metadata["name"])
                    or identity["version"] != metadata["version"]):
                raise ValueError("Python wheel identity differs from the resolver report")
            if _distribution(identity["name"]) == _distribution(spec["package"]):
                selected_version = identity["version"]
                entry = entries.get(spec["entrypoint"])
            wheels.append({**identity, "filename": filename, "url": url, "sha256": expected})
        if not entry or not selected_version:
            raise ValueError("Requested Python entrypoint is not a declared console script")
        if spec["version"] != "latest" and selected_version != spec["version"]:
            raise ValueError("Python resolved a version different from the exact registration")
        if len({item["filename"] for item in wheels}) != len(wheels):
            raise ValueError("Python wheel closure contains duplicate filenames")
        return {"target": target, "version": selected_version, "wheels": sorted(wheels, key=lambda item: item["filename"]),
                "console_script": spec["entrypoint"], "entrypoint": entry}


def resolve(spec: dict) -> dict:
    declaration = copy.deepcopy(spec)
    recipe = {"npm": _resolve_npm, "python": _resolve_python, "http": lambda _: {}}[spec["kind"]](spec)
    return {"name": spec["name"], "kind": spec["kind"], "declaration": declaration,
            "declaration_sha256": _sha(_json(declaration)), "recipe": recipe}


def _root(record: dict, state: Path) -> Path:
    return state / "tools/mcp" / _relative(record["name"]) / _sha(_json(record))


def _launch(record: dict, root: Path) -> Path:
    if record["kind"] == "npm":
        return root / _relative(record["recipe"]["bin"])
    name = _relative(record["recipe"]["console_script"])
    return root / "venv" / ("Scripts" if os.name == "nt" else "bin") / (name + (".exe" if os.name == "nt" else ""))


def _fields(value, fields: set[str]) -> None:
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError("Invalid MCP package record fields")


def _digest(value) -> None:
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
        raise ValueError("Invalid MCP artifact SHA256 integrity")


def _npm_closure(lock: dict, package_json: dict) -> None:
    packages = lock["packages"]
    root = packages.get("")
    if (not isinstance(root, dict) or root.get("dependencies") != package_json["dependencies"]
            or root.get("name") != package_json["name"] or root.get("version") != package_json["version"]):
        raise ValueError("npm lock root differs from its manifest")
    for path, metadata in packages.items():
        if not isinstance(metadata, dict):
            raise ValueError("Invalid npm lock package metadata")
        if path and not metadata.get("inBundle"):
            if not isinstance(metadata.get("version"), str) or not metadata["version"]:
                raise ValueError("npm dependency version is missing")
            algorithm, encoded = metadata["integrity"].split("-", 1)
            if len(base64.b64decode(encoded, validate=True)) != hashlib.new(algorithm).digest_size:
                raise ValueError("Invalid npm artifact integrity")
        required = {}
        for field in ("dependencies", "optionalDependencies", "peerDependencies"):
            dependencies = metadata.get(field, {})
            if (not isinstance(dependencies, dict)
                    or not all(isinstance(name, str) and isinstance(version, str) for name, version in dependencies.items())):
                raise ValueError("Invalid npm dependency declarations")
            if field != "optionalDependencies":
                required.update(dependencies)
        optional = metadata.get("optionalDependencies", {})
        peers = metadata.get("peerDependenciesMeta", {})
        if not isinstance(peers, dict) or not all(isinstance(value, dict) for value in peers.values()):
            raise ValueError("Invalid npm peer dependency metadata")
        for name in required:
            if not re.fullmatch(r"(?:@[a-z0-9][a-z0-9_.-]*/)?[a-z0-9][a-z0-9_.-]*", name):
                raise ValueError("Invalid npm dependency name")
            if name in optional or peers.get(name, {}).get("optional") is True:
                continue
            parent = path
            while True:
                candidate = f"{parent}/node_modules/{name}" if parent else f"node_modules/{name}"
                if candidate in packages:
                    break
                if not parent:
                    raise ValueError("npm lock closure is missing a required dependency")
                parent = parent.rpartition("/node_modules/")[0]


def _python_recipe(recipe: dict, declaration: dict) -> None:
    from pip._vendor.packaging.markers import default_environment
    from pip._vendor.packaging.requirements import Requirement
    from pip._vendor.packaging.specifiers import SpecifierSet
    from pip._vendor.packaging.utils import parse_wheel_filename
    from pip._vendor.packaging.version import Version

    _fields(recipe, {"target", "version", "wheels", "console_script", "entrypoint"})
    target = recipe["target"]
    _fields(target, {"implementation", "version", "platform", "tags", "markers"})
    if (not all(isinstance(target[key], str) and target[key] for key in ("implementation", "platform"))
            or not isinstance(target["version"], list) or len(target["version"]) != 3
            or not all(type(part) is int and part >= 0 for part in target["version"])
            or not isinstance(target["tags"], list) or not target["tags"]
            or not all(isinstance(tag, str) and re.fullmatch(r"[\w.]+-[\w.]+-[\w.]+", tag) for tag in target["tags"])):
        raise ValueError("Invalid Python target context")
    _fields(target["markers"], set(default_environment()))
    if not all(isinstance(value, str) for value in target["markers"].values()):
        raise ValueError("Invalid Python target markers")
    version = ".".join(map(str, target["version"]))
    if (target["markers"]["python_full_version"] != version
            or target["markers"]["python_version"] != ".".join(map(str, target["version"][:2]))
            or target["markers"]["implementation_name"] != target["implementation"]):
        raise ValueError("Inconsistent Python target context")
    if (recipe["console_script"] != declaration["entrypoint"]
            or not isinstance(recipe["entrypoint"], str)
            or not re.fullmatch(r"[\w.]+\s*:\s*[\w.]+(?:\s*\[[\w., -]+\])?", recipe["entrypoint"])):
        raise ValueError("Invalid Python console script")
    if not isinstance(recipe["wheels"], list) or not recipe["wheels"]:
        raise ValueError("Python wheel closure is missing")
    distributions = {}
    filenames = set()
    for artifact in recipe["wheels"]:
        _fields(artifact, {"name", "version", "filename", "url", "sha256", "requires_dist", "requires_python", "tags"})
        filename = _relative(artifact["filename"])
        if "/" in filename or filename in filenames:
            raise ValueError("Invalid or duplicate Python wheel filename")
        filenames.add(filename)
        name, wheel_version, _, filename_tags = parse_wheel_filename(filename)
        if (not isinstance(artifact["name"], str) or not isinstance(artifact["version"], str)
                or name != _distribution(artifact["name"]) or wheel_version != Version(artifact["version"])
                or name in distributions):
            raise ValueError("Invalid or duplicate Python wheel identity")
        _url(artifact["url"])
        _digest(artifact["sha256"])
        if (not isinstance(artifact["tags"], list) or not artifact["tags"]
                or not all(isinstance(tag, str) for tag in artifact["tags"])
                or not set(artifact["tags"]).intersection(target["tags"])
                or not {str(tag) for tag in filename_tags}.intersection(target["tags"])):
            raise ValueError("Python wheel is incompatible with the recorded target")
        if (not isinstance(artifact["requires_python"], str)
                or not SpecifierSet(artifact["requires_python"]).contains(version, prereleases=True)):
            raise ValueError("Python wheel Requires-Python is incompatible with the recorded target")
        if not isinstance(artifact["requires_dist"], list) or not all(isinstance(item, str) for item in artifact["requires_dist"]):
            raise ValueError("Invalid Python wheel requirements")
        for requirement in artifact["requires_dist"]:
            Requirement(requirement)
        distributions[name] = artifact
    package = _distribution(declaration["package"])
    if package not in distributions or distributions[package]["version"] != recipe["version"]:
        raise ValueError("Selected Python package is absent from its wheel closure")
    pending = [(package, frozenset())]
    visited = set()
    while pending:
        name, extras = pending.pop()
        if (name, extras) in visited:
            continue
        visited.add((name, extras))
        for text in distributions[name]["requires_dist"]:
            requirement = Requirement(text)
            if requirement.marker and not any(requirement.marker.evaluate({**target["markers"], "extra": extra})
                                              for extra in {"", *extras}):
                continue
            dependency = distributions.get(_distribution(requirement.name))
            if dependency is None or not requirement.specifier.contains(dependency["version"], prereleases=True):
                raise ValueError("Python wheel closure is missing a required dependency or version")
            if requirement.url and _url(requirement.url) != dependency["url"]:
                raise ValueError("Python wheel dependency URL differs from its closure")
            pending.append((_distribution(requirement.name), frozenset(requirement.extras)))


def _validate_record(record: dict) -> None:
    try:
        _fields(record, {"name", "kind", "declaration", "declaration_sha256", "recipe"})
        declaration = registry._mcp(record["declaration"])
        if (declaration != record["declaration"] or record["name"] != declaration["name"]
                or record["kind"] != declaration["kind"] or record["declaration_sha256"] != _sha(_json(declaration))):
            raise ValueError("MCP package record does not match its declaration")
        recipe = record["recipe"]
        if record["kind"] == "http":
            _fields(recipe, set())
            return
        if not isinstance(recipe, dict) or not isinstance(recipe.get("version"), str) or not recipe["version"]:
            raise ValueError("MCP package recipe version is missing")
        if declaration["version"] != "latest" and recipe["version"] != declaration["version"]:
            raise ValueError("MCP package recipe version differs from its declaration")
        if record["kind"] == "python":
            _python_recipe(recipe, declaration)
        else:
            _fields(recipe, {"target", "package_json", "package_lock", "version", "bin", "bin_sha256"})
            _fields(recipe["target"], {"node", "platform", "arch", "npm"})
            if not all(isinstance(value, str) and value for value in recipe["target"].values()):
                raise ValueError("Invalid npm target context")
            expected = {"name": "personal-harness-mcp", "version": "1.0.0", "private": True,
                        "dependencies": {declaration["package"]: declaration["version"]}}
            if recipe["package_json"] != expected:
                raise ValueError("npm manifest differs from its declaration")
            selected = _npm_lock(recipe["package_lock"], declaration["package"])
            _npm_closure(recipe["package_lock"], expected)
            prefix = f"node_modules/{declaration['package']}/"
            if selected["version"] != recipe["version"] or not _relative(recipe["bin"]).startswith(prefix):
                raise ValueError("npm package identity or bin differs from its recipe")
            _digest(recipe["bin_sha256"])
    except (KeyError, TypeError, AttributeError):
        raise ValueError("Invalid MCP package record") from None


def preflight(record: dict) -> None:
    """Validate the portable recipe and current runtime without installing or downloading."""
    _validate_record(record)
    if record["kind"] == "http":
        return
    context = _npm_tools()[1] if record["kind"] == "npm" else _python_context()
    if context != record["recipe"]["target"]:
        raise ValueError("MCP package target context changed; resolve an update for this runtime")


def configuration(record: dict, state: Path, *, node: str = "node") -> dict:
    _validate_record(record)
    declaration = record["declaration"]
    if record["kind"] == "http":
        result = {"url": declaration["url"]}
        if declaration.get("bearer_token_env_var"):
            result["bearer_token_env_var"] = declaration["bearer_token_env_var"]
        return result
    executable = str(_launch(record, _root(record, state)))
    return {"command": node if record["kind"] == "npm" else executable,
            "args": ([executable] if record["kind"] == "npm" else []) + declaration["args"],
            "env_vars": declaration["env_vars"].copy()}


def _tree(root: Path, state: Path, guard) -> dict[str, str]:
    files = {}
    guard(root, state)
    for directory, dirs, names in os.walk(root, followlinks=False):
        current = Path(directory)
        for name in dirs:
            guard(current / name, state)
        for name in names:
            path = current / name
            guard(path, state)
            if name.endswith(".pyc") or "__pycache__" in path.parts or path == root / "receipt.json":
                continue
            files[path.relative_to(root).as_posix()] = _sha(path.read_bytes())
    return files


def missing(record: dict, state: Path, *, guard) -> list[str]:
    if record["kind"] == "http":
        return []
    root = _root(record, state)
    receipt_path = root / "receipt.json"
    guard(receipt_path, state)
    if not receipt_path.is_file():
        return [f"MCP {record['name']} package receipt is missing"]
    try:
        receipt = json.loads(receipt_path.read_bytes())
        if receipt.get("record_sha256") != _sha(_json(record)) or not receipt.get("files"):
            return [f"MCP {record['name']} package receipt does not match its recipe"]
        files = receipt["files"]
        launch = _launch(record, root)
        if launch.relative_to(root).as_posix() not in files:
            return [f"MCP {record['name']} launch file is absent from its receipt"]
        for name, expected in files.items():
            path = root / _relative(name)
            guard(path, state)
            if not path.is_file() or _sha(path.read_bytes()) != expected:
                return [f"MCP {record['name']} installed artifact is missing or changed"]
        return []
    except (OSError, ValueError, TypeError, KeyError):
        return [f"MCP {record['name']} package receipt is invalid"]


def install(record: dict, state: Path, *, guard) -> None:
    preflight(record)
    if record["kind"] == "http":
        return
    recipe = record["recipe"]
    if record["kind"] == "npm":
        command, _ = _npm_tools()
    context = recipe["target"]
    root = _root(record, state)
    guard(root, state)
    if not missing(record, state, guard=guard):
        return
    _tree(root, state, guard)
    root.mkdir(parents=True, exist_ok=True)
    receipt = root / "receipt.json"
    guard(receipt, state)
    receipt.unlink(missing_ok=True)
    if record["kind"] == "npm":
        for name, data in (("package.json", recipe["package_json"]), ("package-lock.json", recipe["package_lock"])):
            path = root / name
            guard(path, state)
            path.write_bytes(_json(data))
        cache = state / "tools/mcp-cache/npm"
        _tree(cache, state, guard)
        guard(cache, state)
        _npm(command, ["ci"], root, cache)
        manifest = root / "node_modules" / record["declaration"]["package"] / "package.json"
        guard(manifest, state)
        metadata = json.loads(manifest.read_bytes())
        if (metadata.get("name") != record["declaration"]["package"] or metadata.get("version") != recipe["version"]
                or f"node_modules/{metadata['name']}/{_npm_bin(metadata, record['declaration']['entrypoint'])}" != recipe["bin"]):
            raise ValueError("Installed npm package identity or bin differs from the recipe")
        launch = _launch(record, root)
        guard(launch, state)
        if _sha(launch.read_bytes()) != recipe["bin_sha256"]:
            raise ValueError("Installed npm bin SHA256 mismatch")
    else:
        wheelhouse = root / "wheels"
        guard(wheelhouse, state)
        wheelhouse.mkdir(exist_ok=True)
        wheels = []
        for artifact in recipe["wheels"]:
            destination = wheelhouse / _relative(artifact["filename"])
            guard(destination, state)
            data = destination.read_bytes() if destination.is_file() else b""
            if _sha(data) != artifact["sha256"]:
                data = _fetch(artifact["url"])
            if _sha(data) != artifact["sha256"]:
                raise ValueError("Python wheel SHA256 mismatch")
            identity, entries = _wheel(data, artifact["filename"], context)
            if identity != {key: artifact[key] for key in identity}:
                raise ValueError("Python wheel identity differs from the recipe")
            if _distribution(identity["name"]) == _distribution(record["declaration"]["package"]):
                if entries.get(recipe["console_script"]) != recipe["entrypoint"]:
                    raise ValueError("Python console script differs from the recipe")
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(dir=wheelhouse, prefix=".wheel-", delete=False) as stream:
                    temporary = Path(stream.name)
                    guard(temporary, state)
                    stream.write(data)
                temporary.replace(destination)
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
            wheels.append(str(destination))
        environment = root / "venv"
        guard(environment, state)
        venv.EnvBuilder(with_pip=False, symlinks=False).create(environment)
        interpreter = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        guard(interpreter, state)
        cache = state / "tools/mcp-cache/pip"
        _tree(cache, state, guard)
        guard(cache, state)
        _run([sys.executable, "-I", "-B", "-m", "pip", "--disable-pip-version-check", "--cache-dir", str(cache),
              "--python", str(interpreter), "install", "--no-index", "--no-deps", "--no-compile",
              "--force-reinstall", "--no-warn-script-location", *wheels], env=_replay_environment())
    files = _tree(root, state, guard)
    if _launch(record, root).relative_to(root).as_posix() not in files:
        raise ValueError("Installed package console script is missing")
    receipt.write_bytes(_json({"record_sha256": _sha(_json(record)), "files": files}))
