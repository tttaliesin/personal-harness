"""Bounded, HTTPS-pinned installer for Microsoft's NuGet MCP Windows tool.

The package and SDK archives are inspected as data; no package manager or server
is executed. SHA512 pins establish replay integrity, not signature verification.
"""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import platform
import re
import stat
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

from windows_paths import io_path


PACKAGE = "NuGet.Mcp.Server"
RID_PACKAGE = PACKAGE + ".win-x64"
ENTRYPOINT = "nuget-mcp-server"
FRAMEWORK = "net10.0"
DLL = "tools/net10.0/win-x64/NuGet.Mcp.Server.dll"
RELEASES_URL = "https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/10.0/releases.json"
FLAT = "https://api.nuget.org/v3-flatcontainer"
_VERSION = r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*))?"
_ARTIFACT = {"url", "sha512", "files"}
_RECIPE = {"target", "package", "version", "entrypoint", "framework", "args", "env_vars", "dll", "sdk", "base", "rid"}
_HOSTS = {"api.nuget.org", "dotnetcli.blob.core.windows.net", "builds.dotnet.microsoft.com"}


def _fields(value, fields):
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError("Invalid NuGet recipe fields")


def _version(value):
    if not isinstance(value, str) or not re.fullmatch(_VERSION, value):
        raise ValueError("NuGet requires a numeric exact stable version")
    return tuple(int(part) for part in value.split(".")) + (0,) * (4 - len(value.split(".")))


def _declaration(spec):
    if (not isinstance(spec, dict) or not isinstance(spec.get("package"), str)
            or spec["package"].casefold() != PACKAGE.casefold()
            or spec.get("entrypoint") != ENTRYPOINT):
        raise ValueError("Only official NuGet.Mcp.Server with entrypoint nuget-mcp-server is supported")
    if spec.get("version", "latest") != "latest":
        _version(spec["version"])
    args, env_vars = spec.get("args", []), spec.get("env_vars", [])
    if (not isinstance(args, list) or not all(isinstance(arg, str) and not any(ord(c) < 32 for c in arg) for arg in args)
            or not isinstance(env_vars, list)
            or not all(isinstance(key, str) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key) for key in env_vars)):
        raise ValueError("Invalid NuGet args or env_vars")


def _url(value):
    if not isinstance(value, str) or any(c.isspace() or ord(c) < 32 for c in value) or "\\" in value:
        raise ValueError("NuGet artifacts require official Microsoft HTTPS URLs")
    parsed = urllib.parse.urlsplit(value)
    if (parsed.scheme != "https" or parsed.netloc not in _HOSTS
            or parsed.query or parsed.fragment or parsed.username or parsed.password):
        raise ValueError("NuGet artifacts require official Microsoft HTTPS URLs")
    return value


def _fetch(url):
    _url(url)
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "personal-harness"})
        with urllib.request.urlopen(request, timeout=60) as response:
            _url(response.url)
            return response.read()
    except OSError:
        raise ValueError("Unable to download official NuGet or .NET artifact") from None


def _relative(value):
    if (not isinstance(value, str) or not value or "\\" in value
            or any(ord(c) < 32 or c in '<>:"|?*' for c in value)
            or PurePosixPath(value).is_absolute()):
        raise ValueError("Unsafe NuGet ZIP path")
    reserved = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}
    if any(part in ("", ".", "..") or part.endswith((".", " ")) or part.split(".")[0].upper() in reserved
           for part in value.split("/")):
        raise ValueError("Unsafe NuGet ZIP path")
    return value


def _paths(files):
    folded = set()
    for name in files:
        key = _relative(name).casefold()
        if key in folded:
            raise ValueError("Duplicate Windows ZIP path")
        folded.add(key)
    for key in folded:
        if any(parent.as_posix() in folded for parent in PurePosixPath(key).parents if parent.as_posix() != "."):
            raise ValueError("ZIP file conflicts with a parent directory")


def _entries(archive):
    files, names = {}, set()
    for entry in archive.infolist():
        name = _relative(entry.orig_filename[:-1] if entry.is_dir() else entry.orig_filename)
        mode = stat.S_IFMT(entry.external_attr >> 16)
        if (entry.orig_filename != entry.filename or entry.flag_bits & 1
                or mode not in (0, stat.S_IFREG, stat.S_IFDIR)
                or (mode == stat.S_IFDIR and not entry.is_dir())
                or entry.external_attr & 0x400):
            raise ValueError("ZIP links, special files, and encrypted entries are unsupported")
        if name.casefold() in names:
            raise ValueError("Duplicate Windows ZIP path")
        names.add(name.casefold())
        if not entry.is_dir():
            files[name] = entry
    _paths(files)
    folded_files = {key.casefold() for key in files}
    for name in names:
        if name not in folded_files and any(
                parent.as_posix() in folded_files
                for parent in PurePosixPath(name).parents if parent.as_posix() != "."):
            raise ValueError("ZIP file conflicts with a parent directory")
    return files


def _manifest(data):
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            result = {}
            for name, entry in _entries(archive).items():
                with archive.open(entry) as stream:
                    result[name] = hashlib.file_digest(stream, "sha256").hexdigest()
            if not result:
                raise ValueError("Empty NuGet or SDK ZIP")
            return result
    except (zipfile.BadZipFile, NotImplementedError, RuntimeError):
        raise ValueError("Invalid NuGet or SDK ZIP") from None


def _xml(data):
    if re.search(br"<!\s*(?:DOCTYPE|ENTITY)", data, re.I):
        raise ValueError("DTD and entities are unsupported in NuGet metadata")
    try:
        return ET.fromstring(data)
    except ET.ParseError:
        raise ValueError("Invalid NuGet XML metadata") from None


def _identity(archive, package, version):
    names = [name for name in archive.namelist() if name.endswith(".nuspec") and "/" not in name]
    if len(names) != 1:
        raise ValueError("NuGet package must contain one nuspec")
    metadata = _xml(archive.read(names[0])).find("{*}metadata")
    package_type = "DotnetTool" if package == PACKAGE else "DotnetToolRidPackage"
    if (metadata is None or (metadata.findtext("{*}id") or "").casefold() != package.casefold()
            or metadata.findtext("{*}version") != version
            or not any(item.get("name", "").casefold() == package_type.casefold() for item in metadata.findall("{*}packageTypes/{*}packageType"))
            or metadata.findall(".//{*}dependency")):
        raise ValueError("NuGet package identity, tool type, or dependency layout differs from the bounded recipe")


def _packages(base, rid, version, runtime):
    try:
        with zipfile.ZipFile(io.BytesIO(base)) as archive:
            _identity(archive, PACKAGE, version)
            settings = _xml(archive.read("tools/any/any/DotnetToolSettings.xml"))
            platforms = settings.findall("{*}RuntimeIdentifierPackages/{*}RuntimeIdentifierPackage")
            selected = [item for item in platforms if item.get("RuntimeIdentifier") == "win-x64"]
            commands = settings.findall("{*}Commands/{*}Command")
            if (settings.get("Version") != "2" or len(selected) != 1
                    or selected[0].get("Id", "").casefold() != RID_PACKAGE.casefold()
                    or selected[0].get("Version", version) != version
                    or len(commands) != 1 or commands[0].get("Name") != ENTRYPOINT):
                raise ValueError("Unsupported NuGet RID tool indirection")
        with zipfile.ZipFile(io.BytesIO(rid)) as archive:
            _identity(archive, RID_PACKAGE, version)
            prefix = "tools/net10.0/win-x64/"
            settings = _xml(archive.read(prefix + "DotnetToolSettings.xml"))
            commands = settings.findall("{*}Commands/{*}Command")
            if (settings.get("Version") not in ("1", "2") or len(commands) != 1
                    or any(commands[0].get(key) != value for key, value in {
                        "Name": ENTRYPOINT, "EntryPoint": "NuGet.Mcp.Server.exe", "Runner": "executable"}.items())):
                raise ValueError("Unsupported NuGet net10.0 executable entrypoint")
            for name in (DLL, prefix + "NuGet.Mcp.Server.exe", prefix + "NuGet.Mcp.Server.deps.json"):
                archive.getinfo(name)
            options = json.loads(archive.read(prefix + "NuGet.Mcp.Server.runtimeconfig.json"))["runtimeOptions"]
            frameworks = options["frameworks"]
            if (options.get("tfm") != FRAMEWORK or len(frameworks) != 2
                    or {item["name"] for item in frameworks} != {"Microsoft.NETCore.App", "Microsoft.AspNetCore.App"}
                    or any(not item["version"].startswith("10.0.") or _version(item["version"]) > _version(runtime)
                           for item in frameworks)):
                raise ValueError("Private .NET 10 SDK does not satisfy the server's shared frameworks")
    except (KeyError, TypeError, AttributeError, json.JSONDecodeError, zipfile.BadZipFile):
        raise ValueError("Missing or invalid NuGet net10.0 tool payload") from None


def _package_url(package, version):
    return f"{FLAT}/{package.lower()}/{version}/{package.lower()}.{version}.nupkg"


def _sdk_url(version):
    return f"https://builds.dotnet.microsoft.com/dotnet/Sdk/{version}/dotnet-sdk-{version}-win-x64.zip"


def _artifact(data, url):
    return {"url": url, "sha512": hashlib.sha512(data).hexdigest(), "files": _manifest(data)}


def _sdk_required(sdk, files):
    runtime, version = sdk["runtime_version"], sdk["version"]
    required = {"dotnet.exe", f"sdk/{version}/MSBuild.dll", f"sdk/{version}/Microsoft.Build.dll",
                f"host/fxr/{runtime}/hostfxr.dll", f"shared/Microsoft.NETCore.App/{runtime}/Microsoft.NETCore.App.deps.json",
                f"shared/Microsoft.AspNetCore.App/{runtime}/Microsoft.AspNetCore.App.deps.json"}
    if not required.issubset(files):
        raise ValueError("SDK ZIP lacks the pinned SDK or required .NET and ASP.NET Core runtimes")


def resolve(spec: dict) -> dict:
    """Resolve public metadata and archives to a portable, fully hashed recipe."""
    _declaration(spec)
    version = spec.get("version", "latest")
    if version == "latest":
        versions = json.loads(_fetch(f"{FLAT}/{PACKAGE.lower()}/index.json"))["versions"]
        stable = [item for item in versions if isinstance(item, str) and re.fullmatch(_VERSION, item)]
        if not stable:
            raise ValueError("No stable NuGet.Mcp.Server version is available")
        version = max(stable, key=_version)
    releases = json.loads(_fetch(RELEASES_URL))
    sdk_version = releases["latest-sdk"]
    if (releases.get("channel-version") != "10.0" or releases.get("release-type") != "lts"
            or not isinstance(sdk_version, str) or not re.fullmatch(r"10\.0\.[0-9]+", sdk_version)):
        raise ValueError("Official release metadata does not select a stable .NET 10 LTS SDK")
    sdks = [sdk for release in releases["releases"] for sdk in [release.get("sdk", {}), *release.get("sdks", [])]
            if sdk.get("version") == sdk_version]
    if not sdks:
        raise ValueError("Latest .NET 10 SDK is absent from official release metadata")
    selected = sdks[0]
    candidates = [item for item in selected["files"] if item.get("rid") == "win-x64" and item.get("name", "").endswith(".zip")]
    if len(candidates) != 1 or candidates[0]["url"] != _sdk_url(sdk_version):
        raise ValueError("Unsupported official Windows x64 SDK ZIP metadata")
    sdk_file = candidates[0]
    if not re.fullmatch(r"[0-9a-fA-F]{128}", sdk_file.get("hash", "")):
        raise ValueError("SDK release metadata lacks SHA512 integrity")
    sdk = {"url": sdk_file["url"], "sha512": sdk_file["hash"].lower(),
           "version": sdk_version, "runtime_version": selected["runtime-version"]}
    base_url, rid_url = _package_url(PACKAGE, version), _package_url(RID_PACKAGE, version)
    base, rid = _fetch(base_url), _fetch(rid_url)
    base_artifact, rid_artifact = _artifact(base, base_url), _artifact(rid, rid_url)
    _packages(base, rid, version, sdk["runtime_version"])
    recipe = {"target": {"platform": "win32", "arch": "x64"}, "package": PACKAGE, "version": version,
              "entrypoint": ENTRYPOINT, "framework": FRAMEWORK, "dll": DLL,
              "args": spec.get("args", []).copy(), "env_vars": spec.get("env_vars", []).copy(), "sdk": sdk,
              "base": {**base_artifact, "id": PACKAGE, "version": version},
              "rid": {**rid_artifact, "id": RID_PACKAGE, "version": version}}
    validate(recipe, spec)
    return recipe


def validate(recipe: dict, declaration: dict) -> None:
    """Validate a locked recipe offline, without probing local SDKs or feeds."""
    try:
        _declaration(declaration)
        _fields(recipe, _RECIPE)
        _version(recipe["version"])
        if (recipe["target"] != {"platform": "win32", "arch": "x64"} or recipe["package"] != PACKAGE
                or recipe["entrypoint"] != ENTRYPOINT or recipe["framework"] != FRAMEWORK or recipe["dll"] != DLL
                or (declaration.get("version", "latest") != "latest" and declaration["version"] != recipe["version"])
                or recipe["args"] != declaration.get("args", []) or recipe["env_vars"] != declaration.get("env_vars", [])):
            raise ValueError("NuGet recipe differs from its declaration or supported target")
        for key in ("sdk", "base", "rid"):
            artifact = recipe[key]
            _fields(artifact, ({"url", "sha512", "version", "runtime_version"} if key == "sdk"
                               else _ARTIFACT | {"id", "version"}))
            _url(artifact["url"])
            if not re.fullmatch(r"[0-9a-f]{128}", artifact["sha512"]):
                raise ValueError("Invalid NuGet artifact SHA512")
            if key == "sdk":
                continue
            if (not isinstance(artifact["files"], dict) or not artifact["files"]
                    or not all(isinstance(digest, str) and re.fullmatch(r"[0-9a-f]{64}", digest) for digest in artifact["files"].values())):
                raise ValueError("Invalid NuGet file SHA256 manifest")
            _paths(artifact["files"])
        sdk = recipe["sdk"]
        if (not re.fullmatch(r"10\.0\.[0-9]+", sdk["version"])
                or not re.fullmatch(r"10\.0\.[0-9]+", sdk["runtime_version"])
                or sdk["url"] != _sdk_url(sdk["version"])):
            raise ValueError("NuGet recipe requires the official stable .NET 10 SDK ZIP")
        for key, package in (("base", PACKAGE), ("rid", RID_PACKAGE)):
            artifact = recipe[key]
            if (artifact["id"] != package or artifact["version"] != recipe["version"]
                    or artifact["url"] != _package_url(package, recipe["version"])):
                raise ValueError("NuGet artifact identity or URL differs from the pinned package")
        if not {DLL, DLL[:-4] + ".exe", DLL[:-4] + ".deps.json", DLL[:-4] + ".runtimeconfig.json",
                "tools/net10.0/win-x64/DotnetToolSettings.xml"}.issubset(recipe["rid"]["files"]):
            raise ValueError("NuGet net10.0 payload is incomplete")
        if "tools/any/any/DotnetToolSettings.xml" not in recipe["base"]["files"]:
            raise ValueError("NuGet base tool settings are missing")
    except (KeyError, TypeError, AttributeError):
        raise ValueError("Invalid NuGet recipe") from None


def preflight(recipe: dict) -> None:
    """Only Windows x64 is supported; an existing dotnet on PATH is unnecessary."""
    validate(recipe, {key: recipe.get(key) for key in ("package", "version", "entrypoint", "args", "env_vars")})
    if platform.system() != "Windows" or platform.machine().lower() not in ("amd64", "x86_64"):
        raise ValueError("NuGet MCP packages require Windows x64")


def launch(recipe: dict, root: Path) -> Path:
    return root / "dotnet/dotnet.exe"


def _runtime(root, state):
    # Root identity is available to both install and configuration, without a
    # dependency on mcp_packages' record-directory naming convention.
    identity = hashlib.sha256(str(root.absolute()).encode("utf-8")).hexdigest()
    return state / "tools/mcp-cache/nuget/runtime" / identity


def configuration(recipe: dict, root: Path, state: Path, name: str) -> dict:
    runtime, dotnet = _runtime(root, state), root / "dotnet"
    environment = {"DOTNET_ROOT": str(dotnet), "DOTNET_ROOT_X64": str(dotnet),
                   "DOTNET_HOST_PATH": str(launch(recipe, root)), "DOTNET_MULTILEVEL_LOOKUP": "0",
                   "DOTNET_ROLL_FORWARD": "LatestPatch", "DOTNET_MSBUILD_SDK_RESOLVER_CLI_DIR": str(dotnet),
                   "DOTNET_CLI_HOME": str(runtime / "cli-home"), "DOTNET_CLI_TELEMETRY_OPTOUT": "1",
                   "DOTNET_NOLOGO": "1", "DOTNET_SKIP_FIRST_TIME_EXPERIENCE": "1",
                   "DOTNET_ADD_GLOBAL_TOOLS_TO_PATH": "0", "DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE": "true"}
    return {"command": str(launch(recipe, root)), "args": ["exec", str(root / "package" / recipe["dll"]), *recipe["args"]],
            "env_vars": recipe["env_vars"].copy(), "env": environment, "cwd": str(runtime / "work")}


def install(recipe: dict, root: Path, state: Path, guard) -> None:
    """Replay pinned archives into managed state without executing .NET code."""
    preflight(recipe)
    guard(root, state)
    runtime = _runtime(root, state)
    for directory in (runtime / "cli-home", runtime / "work"):
        guard(directory, state)
        io_path(directory).mkdir(parents=True, exist_ok=True)
    verified = {}
    for key in ("sdk", "base", "rid"):
        artifact = recipe[key]
        cache = state / "tools/mcp-cache/nuget/artifacts" / (artifact["sha512"] + ".zip")
        guard(cache, state)
        data = io_path(cache).read_bytes() if io_path(cache).is_file() else _fetch(artifact["url"])
        if hashlib.sha512(data).hexdigest() != artifact["sha512"]:
            raise ValueError(f"NuGet {key} artifact SHA512 mismatch")
        files = _manifest(data)
        if key == "sdk":
            _sdk_required(artifact, files)
        elif files != artifact["files"]:
            raise ValueError(f"NuGet {key} file manifest mismatch")
        if not io_path(cache).is_file():
            guard(cache.parent, state)
            io_path(cache.parent).mkdir(parents=True, exist_ok=True)
            io_path(cache).write_bytes(data)
        verified[key] = data
    _packages(verified["base"], verified["rid"], recipe["version"], recipe["sdk"]["runtime_version"])
    for key, directory in (("sdk", "dotnet"), ("base", "base"), ("rid", "package")):
        with zipfile.ZipFile(io.BytesIO(verified[key])) as archive:
            for name, entry in _entries(archive).items():
                destination = root / directory / name
                guard(destination, state)
                guard(destination.parent, state)
                io_path(destination.parent).mkdir(parents=True, exist_ok=True)
                io_path(destination).write_bytes(archive.read(entry))
